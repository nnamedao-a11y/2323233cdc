import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TelegramLink, TelegramLinkDocument } from './schemas/telegram-link.schema';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export interface TelegramSendInput {
  text: string;
  chatId: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  replyMarkup?: any;
}

// Severity filtering config - which severities go to Telegram
const TELEGRAM_SEVERITY_CONFIG = {
  critical: true,   // Always send
  warning: true,    // Send but can be filtered
  info: false,      // Don't send by default
};

// Event type to severity mapping
const EVENT_SEVERITY_MAP: Record<string, 'critical' | 'warning' | 'info'> = {
  'lead.created': 'warning',
  'lead.hot_not_contacted': 'critical',
  'invoice.overdue': 'critical',
  'invoice.created': 'info',
  'shipment.stalled': 'critical',
  'shipment.no_tracking': 'warning',
  'payment.failed': 'critical',
  'payment.received': 'info',
  'contract.signed': 'info',
  'staff.session_suspicious': 'critical',
  'manager.inactive': 'warning',
  'deal.status_changed': 'info',
  'escalation.teamlead_required': 'critical',
  'escalation.owner_required': 'critical',
};

@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name);
  private botToken: string | null = null;
  private telegramLinkModel: Model<TelegramLinkDocument> | null = null;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || null;
  }

  /**
   * Set the TelegramLink model for user lookup
   */
  setTelegramLinkModel(model: Model<TelegramLinkDocument>) {
    this.telegramLinkModel = model;
  }

  /**
   * Check if event should be sent to Telegram based on severity
   */
  shouldSendToTelegram(eventType: string, forceSend = false): boolean {
    if (forceSend) return true;
    
    const severity = EVENT_SEVERITY_MAP[eventType] || 'info';
    return TELEGRAM_SEVERITY_CONFIG[severity];
  }

  /**
   * Get severity for event type
   */
  getSeverity(eventType: string): 'critical' | 'warning' | 'info' {
    return EVENT_SEVERITY_MAP[eventType] || 'info';
  }

  /**
   * Get chat ID for user
   */
  async getChatIdForUser(userId: string): Promise<string | null> {
    if (!this.telegramLinkModel) {
      this.logger.warn('TelegramLink model not set');
      return null;
    }

    const link = await this.telegramLinkModel.findOne({ 
      userId, 
      isActive: true, 
      notificationsEnabled: true 
    });

    return link?.telegramChatId || null;
  }

  /**
   * Send notification to user if they have Telegram linked
   */
  async sendToUser(userId: string, notification: {
    title: string;
    message: string;
    eventType?: string;
    severity?: string;
    meta?: any;
  }): Promise<{ sent: boolean; reason?: string }> {
    const eventType = notification.eventType || '';
    
    // Check severity filtering
    if (!this.shouldSendToTelegram(eventType)) {
      return { sent: false, reason: 'filtered_by_severity' };
    }

    const chatId = await this.getChatIdForUser(userId);
    if (!chatId) {
      return { sent: false, reason: 'telegram_not_linked' };
    }

    const { text, replyMarkup } = this.formatMessageWithButtons({
      ...notification,
      severity: notification.severity || this.getSeverity(eventType),
    });

    try {
      await this.send({ chatId, text, replyMarkup });
      return { sent: true };
    } catch (error: any) {
      this.logger.error(`Failed to send to user ${userId}: ${error.message}`);
      return { sent: false, reason: error.message };
    }
  }

  /**
   * Send message via Telegram
   */
  async send(input: TelegramSendInput): Promise<any> {
    if (!this.botToken) {
      this.logger.warn('Telegram bot token not configured');
      throw new ServiceUnavailableException('Telegram bot not configured');
    }

    const url = `${TELEGRAM_API_BASE}${this.botToken}/sendMessage`;
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          parse_mode: input.parseMode || 'HTML',
          reply_markup: input.replyMarkup,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(`Telegram send failed: ${res.status} - ${errorText}`);
        throw new Error(`Telegram send failed: ${res.status}`);
      }

      return res.json();
    } catch (error: any) {
      this.logger.error(`Telegram send error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format notification for Telegram
   */
  formatMessage(notification: {
    title: string;
    message: string;
    severity?: string;
    meta?: { link?: string; payload?: any };
  }): string {
    const severityIcon = this.getSeverityIcon(notification.severity);
    
    const lines = [
      `${severityIcon} <b>${notification.title}</b>`,
      '',
      notification.message,
    ];

    if (notification.meta?.link) {
      lines.push('');
      lines.push(`<a href="${notification.meta.link}">Відкрити в CRM</a>`);
    }

    return lines.join('\n');
  }

  /**
   * Format notification with action buttons
   */
  formatMessageWithButtons(notification: any): { text: string; replyMarkup: any } {
    const text = this.formatMessage(notification);
    
    const buttons: any[][] = [];
    
    if (notification.meta?.link) {
      buttons.push([
        {
          text: '📋 Відкрити в CRM',
          url: `${process.env.FRONTEND_URL || 'https://bibi-cars.com'}${notification.meta.link}`,
        },
      ]);
    }

    if (notification.type === 'lead.created') {
      buttons.push([
        { text: '📞 Подзвонити', callback_data: `call:${notification.entityId}` },
        { text: '👤 Призначити', callback_data: `assign:${notification.entityId}` },
      ]);
    }

    return {
      text,
      replyMarkup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
    };
  }

  private getSeverityIcon(severity?: string): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return '🔔';
    }
  }

  /**
   * Test connection to Telegram
   */
  async testConnection(): Promise<{ success: boolean; botInfo?: any; error?: string }> {
    if (!this.botToken) {
      return { success: false, error: 'Bot token not configured' };
    }

    try {
      const url = `${TELEGRAM_API_BASE}${this.botToken}/getMe`;
      const res = await fetch(url);
      
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return { success: true, botInfo: data.result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set webhook for receiving updates
   */
  async setWebhook(webhookUrl: string): Promise<any> {
    if (!this.botToken) {
      throw new ServiceUnavailableException('Telegram bot not configured');
    }

    const url = `${TELEGRAM_API_BASE}${this.botToken}/setWebhook`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });

    return res.json();
  }
}
