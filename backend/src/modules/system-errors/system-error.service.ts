/**
 * System Error Service
 * 
 * Централізована обробка помилок з алертами
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemErrorLog, ErrorSeverity } from './system-error-log.schema';
import axios from 'axios';

export interface SafeExecuteOptions {
  retries?: number;
  retryDelay?: number;
  alertOnFail?: boolean;
  fallbackValue?: any;
}

@Injectable()
export class SystemErrorService {
  private readonly logger = new Logger(SystemErrorService.name);
  private telegramBotToken: string;
  private ownerChatId: string;

  constructor(
    @InjectModel(SystemErrorLog.name) private errorLogModel: Model<SystemErrorLog>,
  ) {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID || '';
  }

  /**
   * Safe execute wrapper - ГОЛОВНИЙ МЕТОД
   * Виконує функцію з обробкою помилок, retry та алертами
   */
  async safeExecute<T>(
    module: string,
    action: string,
    fn: () => Promise<T>,
    options: SafeExecuteOptions = {},
  ): Promise<T | null> {
    const { retries = 0, retryDelay = 1000, alertOnFail = true, fallbackValue = null } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn(`[${module}/${action}] Attempt ${attempt + 1}/${retries + 1} failed: ${error.message}`);

        if (attempt < retries) {
          await this.delay(retryDelay * (attempt + 1)); // Exponential backoff
        }
      }
    }

    // All retries failed - log and alert
    await this.logError({
      module,
      action,
      error: lastError?.message || 'Unknown error',
      stackTrace: lastError?.stack,
      severity: ErrorSeverity.HIGH,
    });

    if (alertOnFail) {
      await this.sendCriticalAlert(module, action, lastError?.message || 'Unknown error');
    }

    return fallbackValue;
  }

  /**
   * Log error to database
   */
  async logError(data: {
    module: string;
    action: string;
    error: string;
    stackTrace?: string;
    severity?: ErrorSeverity;
    payload?: any;
    userId?: string;
    context?: any;
  }): Promise<SystemErrorLog | null> {
    try {
      const errorLog = new this.errorLogModel({
        ...data,
        severity: data.severity || ErrorSeverity.MEDIUM,
        resolved: false,
        alertSent: false,
      });

      await errorLog.save();
      this.logger.error(`[${data.module}/${data.action}] ${data.error}`);

      return errorLog;
    } catch (err) {
      this.logger.error(`Failed to log error: ${err.message}`);
      return null;
    }
  }

  /**
   * Send critical alert to owner via Telegram
   */
  async sendCriticalAlert(module: string, action: string, error: string): Promise<boolean> {
    if (!this.telegramBotToken || !this.ownerChatId) {
      this.logger.warn('Telegram not configured for alerts');
      return false;
    }

    try {
      const message = `🔴 CRITICAL ERROR\n\n` +
        `📦 Module: ${module}\n` +
        `⚡ Action: ${action}\n` +
        `❌ Error: ${error}\n` +
        `🕐 Time: ${new Date().toISOString()}`;

      await axios.post(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
        chat_id: this.ownerChatId,
        text: message,
        parse_mode: 'HTML',
      });

      // Mark alert as sent in recent error logs
      await this.errorLogModel.updateMany(
        { module, action, alertSent: false, createdAt: { $gte: new Date(Date.now() - 60000) } },
        { alertSent: true, alertSentAt: new Date() },
      );

      return true;
    } catch (err) {
      this.logger.error(`Failed to send Telegram alert: ${err.message}`);
      return false;
    }
  }

  /**
   * Get unresolved errors
   */
  async getUnresolvedErrors(limit = 100): Promise<SystemErrorLog[]> {
    return this.errorLogModel
      .find({ resolved: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get errors by module
   */
  async getErrorsByModule(module: string, limit = 50): Promise<SystemErrorLog[]> {
    return this.errorLogModel
      .find({ module })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Mark error as resolved
   */
  async resolveError(errorId: string, userId: string, resolution: string): Promise<boolean> {
    const result = await this.errorLogModel.updateOne(
      { _id: errorId },
      {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution,
      },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Get error statistics
   */
  async getErrorStats(since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byModule: Record<string, number>;
    unresolvedCount: number;
  }> {
    const errors = await this.errorLogModel.find({ createdAt: { $gte: since } }).lean();

    const bySeverity: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    let unresolvedCount = 0;

    for (const error of errors) {
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      byModule[error.module] = (byModule[error.module] || 0) + 1;
      if (!error.resolved) unresolvedCount++;
    }

    return {
      total: errors.length,
      bySeverity,
      byModule,
      unresolvedCount,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
