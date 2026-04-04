/**
 * Critical Alert Service
 * 
 * Sends critical alerts to owner via Telegram/Email for:
 * - Payment failed
 * - Payment received (high value)
 * - Invoice overdue (L3 escalation)
 * - Contract signed
 * - Suspicious login
 * - Manager login
 * - Shipment stalled
 * - ETA changed
 * - Integration down
 * - Hot lead missed
 * 
 * All alerts are logged to AlertLog collection for audit
 */

import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';
import axios from 'axios';

export enum AlertEventType {
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_RECEIVED = 'payment_received',
  INVOICE_OVERDUE = 'invoice_overdue',
  CONTRACT_SIGNED = 'contract_signed',
  SUSPICIOUS_LOGIN = 'suspicious_login',
  MANAGER_LOGIN = 'manager_login',
  SHIPMENT_STALLED = 'shipment_stalled',
  ETA_CHANGED = 'eta_changed',
  INTEGRATION_DOWN = 'integration_down',
  HOT_LEAD_MISSED = 'hot_lead_missed',
  WEBHOOK_FAILED = 'webhook_failed',
  SYSTEM_ERROR = 'system_error',
}

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AlertPayload {
  eventType: AlertEventType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels?: ('telegram' | 'email')[];
}

interface AlertLog {
  eventType: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  payload: Record<string, any>;
  channels: string[];
  status: 'pending' | 'sent' | 'failed';
  lastError?: string;
  attempts: number;
  createdAt: Date;
  sentAt?: Date;
}

@Injectable()
export class CriticalAlertService implements OnModuleInit {
  private readonly logger = new Logger(CriticalAlertService.name);
  
  private telegramBotToken: string | null = null;
  private ownerChatId: string | null = null;
  private teamLeadChatIds: string[] = [];

  constructor(
    @Inject(forwardRef(() => IntegrationConfigService))
    private readonly integrationConfigService: IntegrationConfigService,
    @InjectModel('AlertLog') private alertLogModel: Model<AlertLog>,
  ) {}

  async onModuleInit() {
    await this.loadCredentials();
  }

  private async loadCredentials(): Promise<void> {
    try {
      const telegramConfig = await this.integrationConfigService.getCredentials(IntegrationProvider.TELEGRAM);
      this.telegramBotToken = telegramConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
      this.ownerChatId = telegramConfig?.ownerChatId || process.env.TELEGRAM_OWNER_CHAT_ID || null;
      const chatIds = telegramConfig?.teamLeadChatIds;
      this.teamLeadChatIds = Array.isArray(chatIds) ? chatIds : [];
      
      if (this.telegramBotToken && this.ownerChatId) {
        this.logger.log('Critical Alert Service initialized with Telegram');
      } else {
        this.logger.warn('Critical Alert Service: Telegram not configured');
      }
    } catch (error) {
      this.logger.error(`Failed to load alert credentials: ${error.message}`);
    }
  }

  async refreshCredentials(): Promise<void> {
    await this.loadCredentials();
  }

  /**
   * Emit a critical alert
   */
  async emit(alert: AlertPayload): Promise<{ success: boolean; logId?: string; error?: string }> {
    const channels = alert.channels || this.resolveChannels(alert.severity);
    
    // Create alert log
    const alertLog = new this.alertLogModel({
      eventType: alert.eventType,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      payload: alert.data || {},
      channels,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    });

    try {
      // Send via all channels
      for (const channel of channels) {
        if (channel === 'telegram') {
          await this.sendTelegram(alert);
        }
        // Email support would go here
      }

      alertLog.status = 'sent';
      alertLog.sentAt = new Date();
      await alertLog.save();

      this.logger.log(`🚨 Alert sent: [${alert.severity}] ${alert.eventType}`);
      return { success: true, logId: alertLog._id?.toString() };
    } catch (error) {
      alertLog.status = 'failed';
      alertLog.lastError = error.message;
      alertLog.attempts = 1;
      await alertLog.save();

      this.logger.error(`Alert failed: ${error.message}`);
      return { success: false, error: error.message, logId: alertLog._id?.toString() };
    }
  }

  /**
   * Send alert via Telegram
   */
  private async sendTelegram(alert: AlertPayload): Promise<void> {
    if (!this.telegramBotToken || !this.ownerChatId) {
      throw new Error('Telegram not configured');
    }

    const emoji = this.getEmoji(alert.severity);
    const text = this.formatTelegramMessage(alert, emoji);

    // Send to owner
    await axios.post(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
      chat_id: this.ownerChatId,
      text,
      parse_mode: 'HTML',
    });

    // For critical alerts, also send to team leads
    if (alert.severity === 'critical' && this.teamLeadChatIds.length > 0) {
      for (const chatId of this.teamLeadChatIds) {
        try {
          await axios.post(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          });
        } catch (e) {
          this.logger.warn(`Failed to send to team lead ${chatId}: ${e.message}`);
        }
      }
    }
  }

  /**
   * Format Telegram message
   */
  private formatTelegramMessage(alert: AlertPayload, emoji: string): string {
    const lines = [
      `${emoji} <b>${alert.title}</b>`,
      '',
      alert.message,
    ];

    if (alert.data && Object.keys(alert.data).length > 0) {
      lines.push('');
      lines.push('<b>Деталі:</b>');
      for (const [key, value] of Object.entries(alert.data)) {
        if (value !== undefined && value !== null) {
          lines.push(`• ${key}: ${value}`);
        }
      }
    }

    lines.push('');
    lines.push(`<i>${new Date().toLocaleString('uk-UA')}</i>`);

    return lines.join('\n');
  }

  /**
   * Get emoji based on severity
   */
  private getEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🔵';
      default: return '⚪';
    }
  }

  /**
   * Resolve channels based on severity
   */
  private resolveChannels(severity: AlertSeverity): ('telegram' | 'email')[] {
    if (severity === 'critical') return ['telegram', 'email'];
    if (severity === 'high') return ['telegram'];
    return ['telegram'];
  }

  // === CONVENIENCE METHODS ===

  async paymentReceived(amount: number, currency: string, invoiceId: string, customerName: string): Promise<void> {
    await this.emit({
      eventType: AlertEventType.PAYMENT_RECEIVED,
      severity: amount > 10000 ? 'high' : 'medium',
      title: 'Оплата отримана',
      message: `Клієнт ${customerName} оплатив рахунок`,
      data: { amount: `${amount} ${currency}`, invoiceId, customer: customerName },
    });
  }

  async paymentFailed(invoiceId: string, error: string, amount: number): Promise<void> {
    await this.emit({
      eventType: AlertEventType.PAYMENT_FAILED,
      severity: 'high',
      title: 'Помилка оплати',
      message: `Не вдалося обробити оплату`,
      data: { invoiceId, error, amount },
    });
  }

  async invoiceOverdue(invoiceId: string, amount: number, daysOverdue: number, customerName: string): Promise<void> {
    const severity: AlertSeverity = daysOverdue > 7 ? 'critical' : daysOverdue > 3 ? 'high' : 'medium';
    await this.emit({
      eventType: AlertEventType.INVOICE_OVERDUE,
      severity,
      title: `Рахунок прострочений (${daysOverdue} днів)`,
      message: `Рахунок ${invoiceId} клієнта ${customerName} не оплачений`,
      data: { invoiceId, amount, daysOverdue, customer: customerName },
    });
  }

  async suspiciousLogin(userId: string, userName: string, ip: string, reason: string): Promise<void> {
    await this.emit({
      eventType: AlertEventType.SUSPICIOUS_LOGIN,
      severity: 'critical',
      title: 'Підозрілий вхід',
      message: `Виявлено підозрілу активність`,
      data: { user: userName, ip, reason },
    });
  }

  async managerLogin(managerId: string, managerName: string, ip: string): Promise<void> {
    await this.emit({
      eventType: AlertEventType.MANAGER_LOGIN,
      severity: 'low',
      title: 'Вхід менеджера',
      message: `${managerName} увійшов у систему`,
      data: { manager: managerName, ip },
    });
  }

  async integrationDown(provider: string, error: string): Promise<void> {
    await this.emit({
      eventType: AlertEventType.INTEGRATION_DOWN,
      severity: 'critical',
      title: 'Інтеграція недоступна',
      message: `Сервіс ${provider} не відповідає`,
      data: { provider, error },
    });
  }

  async shipmentStalled(shipmentId: string, containerNumber: string, lastUpdateDays: number): Promise<void> {
    await this.emit({
      eventType: AlertEventType.SHIPMENT_STALLED,
      severity: lastUpdateDays > 3 ? 'high' : 'medium',
      title: 'Доставка застопорилась',
      message: `Немає оновлень ${lastUpdateDays} днів`,
      data: { shipmentId, container: containerNumber, daysSinceUpdate: lastUpdateDays },
    });
  }

  async etaChanged(shipmentId: string, oldEta: string, newEta: string, containerNumber: string): Promise<void> {
    await this.emit({
      eventType: AlertEventType.ETA_CHANGED,
      severity: 'medium',
      title: 'ETA змінено',
      message: `Очікуваний час прибуття змінено`,
      data: { shipmentId, container: containerNumber, oldEta, newEta },
    });
  }

  async webhookFailed(provider: string, eventType: string, error: string): Promise<void> {
    await this.emit({
      eventType: AlertEventType.WEBHOOK_FAILED,
      severity: 'high',
      title: 'Webhook помилка',
      message: `Не вдалося обробити webhook від ${provider}`,
      data: { provider, eventType, error },
    });
  }

  async contractSigned(contractId: string, dealId: string, customerName: string): Promise<void> {
    await this.emit({
      eventType: AlertEventType.CONTRACT_SIGNED,
      severity: 'medium',
      title: 'Контракт підписано',
      message: `${customerName} підписав контракт`,
      data: { contractId, dealId, customer: customerName },
    });
  }
}
