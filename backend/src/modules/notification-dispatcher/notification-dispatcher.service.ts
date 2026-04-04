/**
 * Notification Dispatcher Service
 * 
 * Centralized service for sending notifications through multiple channels:
 * - SMS (Twilio)
 * - Viber
 * - Telegram
 * - Email (SMTP)
 * - Cabinet notifications
 * 
 * All credentials loaded from IntegrationConfigService (admin panel)
 */

import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ViberService } from '../viber-bot/viber.service';
import { ConfigService } from '@nestjs/config';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';
import axios from 'axios';
import * as nodemailer from 'nodemailer';

export enum NotificationChannel {
  SMS = 'sms',
  VIBER = 'viber',
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  CABINET = 'cabinet',
}

export interface NotificationRecipient {
  userId?: string;
  customerId?: string;
  phone?: string;
  email?: string;
  viberId?: string;
  telegramId?: string;
  firstName?: string;
  lastName?: string;
}

export interface InvoiceReminderPayload {
  invoiceId: string;
  dealId: string;
  amount: number;
  currency: string;
  dueDate: Date;
  daysOverdue?: number;
  paymentLink?: string;
  reminderType: 'due_24h' | 'due_today' | 'overdue_1d' | 'overdue_3d' | 'overdue_5d';
}

export interface NotificationResult {
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  error?: string;
}

interface TwilioCredentials {
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
}

interface TelegramCredentials {
  botToken?: string;
  ownerChatId?: string;
}

interface EmailCredentials {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  fromEmail?: string;
}

@Injectable()
export class NotificationDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  
  // Cached credentials
  private twilioCredentials: TwilioCredentials | null = null;
  private telegramCredentials: TelegramCredentials | null = null;
  private emailCredentials: EmailCredentials | null = null;
  
  constructor(
    private readonly configService: ConfigService,
    private readonly viberService: ViberService,
    @Inject(forwardRef(() => IntegrationConfigService))
    private readonly integrationConfigService: IntegrationConfigService,
    @InjectModel('Customer') private customerModel: Model<any>,
    @InjectModel('Notification') private notificationModel: Model<any>,
  ) {}

  async onModuleInit() {
    await this.loadCredentials();
  }

  /**
   * Load all notification credentials from DB with .env fallback
   */
  private async loadCredentials(): Promise<void> {
    try {
      // Twilio SMS
      const twilioConfig = await this.integrationConfigService.getCredentials(IntegrationProvider.TWILIO);
      this.twilioCredentials = {
        accountSid: twilioConfig?.accountSid || process.env.TWILIO_ACCOUNT_SID,
        authToken: twilioConfig?.authToken || process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: twilioConfig?.phoneNumber || process.env.TWILIO_PHONE_NUMBER,
      };

      // Telegram
      const telegramConfig = await this.integrationConfigService.getCredentials(IntegrationProvider.TELEGRAM);
      this.telegramCredentials = {
        botToken: telegramConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN,
        ownerChatId: telegramConfig?.ownerChatId || process.env.TELEGRAM_OWNER_CHAT_ID,
      };

      // Email SMTP
      const emailConfig = await this.integrationConfigService.getCredentials(IntegrationProvider.EMAIL);
      this.emailCredentials = {
        host: emailConfig?.host || process.env.SMTP_HOST,
        port: Number(emailConfig?.port) || parseInt(process.env.SMTP_PORT || '587', 10),
        secure: Boolean(emailConfig?.secure) || process.env.SMTP_SECURE === 'true',
        user: emailConfig?.user || process.env.SMTP_USER,
        password: emailConfig?.password || process.env.SMTP_PASSWORD,
        fromEmail: emailConfig?.fromEmail || process.env.SMTP_FROM_EMAIL,
      };

      this.logger.log('Notification credentials loaded from DB/env');
    } catch (error) {
      this.logger.error(`Failed to load notification credentials: ${error.message}`);
    }
  }

  /**
   * Refresh credentials (call after admin updates config)
   */
  async refreshCredentials(): Promise<void> {
    await this.loadCredentials();
  }

  /**
   * Send invoice reminder through all available channels
   */
  async sendInvoiceReminder(
    recipient: NotificationRecipient,
    payload: InvoiceReminderPayload,
    channels: NotificationChannel[] = [NotificationChannel.VIBER, NotificationChannel.SMS, NotificationChannel.CABINET],
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    const message = this.formatInvoiceReminderMessage(payload);

    for (const channel of channels) {
      try {
        let result: NotificationResult;

        switch (channel) {
          case NotificationChannel.VIBER:
            result = await this.sendViber(recipient, message, payload);
            break;
          case NotificationChannel.SMS:
            result = await this.sendSms(recipient, message);
            break;
          case NotificationChannel.TELEGRAM:
            result = await this.sendTelegram(recipient, message, payload);
            break;
          case NotificationChannel.CABINET:
            result = await this.sendCabinetNotification(recipient, message, payload);
            break;
          default:
            result = { channel, success: false, error: 'Unsupported channel' };
        }

        results.push(result);
        
        if (result.success) {
          this.logger.log(`✓ ${channel} notification sent to ${recipient.phone || recipient.viberId || recipient.customerId}`);
        }
      } catch (error) {
        results.push({
          channel,
          success: false,
          error: error.message,
        });
        this.logger.error(`✗ ${channel} notification failed: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Send SMS via Twilio
   */
  async sendSms(recipient: NotificationRecipient, message: string): Promise<NotificationResult> {
    const { accountSid, authToken, phoneNumber } = this.twilioCredentials || {};
    
    if (!accountSid || !authToken || !phoneNumber) {
      this.logger.warn('Twilio not configured, skipping SMS');
      return { channel: NotificationChannel.SMS, success: false, error: 'Twilio not configured' };
    }

    const phone = recipient.phone || await this.getCustomerPhone(recipient.customerId);
    if (!phone) {
      return { channel: NotificationChannel.SMS, success: false, error: 'No phone number' };
    }

    try {
      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams({
          To: phone,
          From: phoneNumber,
          Body: message,
        }),
        {
          auth: {
            username: accountSid,
            password: authToken,
          },
        },
      );

      return {
        channel: NotificationChannel.SMS,
        success: true,
        messageId: response.data.sid,
      };
    } catch (error) {
      this.logger.error(`Twilio error: ${error.response?.data?.message || error.message}`);
      return { channel: NotificationChannel.SMS, success: false, error: error.message };
    }
  }

  /**
   * Send Viber message
   */
  async sendViber(
    recipient: NotificationRecipient,
    message: string,
    payload?: InvoiceReminderPayload,
  ): Promise<NotificationResult> {
    const viberId = recipient.viberId || await this.getCustomerViberId(recipient.customerId);
    if (!viberId) {
      return { channel: NotificationChannel.VIBER, success: false, error: 'No Viber ID' };
    }

    try {
      // Create payment button if payment link exists
      if (payload?.paymentLink) {
        const buttons = [
          {
            Columns: 6,
            Rows: 1,
            BgColor: '#2db9b9',
            ActionType: 'open-url',
            ActionBody: payload.paymentLink,
            Text: '<font color="#ffffff"><b>💳 Оплатити зараз</b></font>',
            TextSize: 'medium',
            TextVAlign: 'middle',
            TextHAlign: 'center',
          },
        ];

        const success = await this.viberService.sendKeyboard(viberId, message, buttons);
        return { channel: NotificationChannel.VIBER, success };
      }

      const success = await this.viberService.sendText(viberId, message);
      return { channel: NotificationChannel.VIBER, success };
    } catch (error) {
      return { channel: NotificationChannel.VIBER, success: false, error: error.message };
    }
  }

  /**
   * Send Telegram message (via bot)
   */
  async sendTelegram(
    recipient: NotificationRecipient,
    message: string,
    payload?: InvoiceReminderPayload,
  ): Promise<NotificationResult> {
    const { botToken } = this.telegramCredentials || {};
    const telegramId = recipient.telegramId || await this.getCustomerTelegramId(recipient.customerId);

    if (!botToken || !telegramId) {
      return { channel: NotificationChannel.TELEGRAM, success: false, error: 'Telegram not configured or no ID' };
    }

    try {
      const keyboard = payload?.paymentLink
        ? {
            inline_keyboard: [
              [{ text: '💳 Оплатити', url: payload.paymentLink }],
            ],
          }
        : undefined;

      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: telegramId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });

      return { channel: NotificationChannel.TELEGRAM, success: true };
    } catch (error) {
      return { channel: NotificationChannel.TELEGRAM, success: false, error: error.message };
    }
  }

  /**
   * Send Email via SMTP
   */
  async sendEmail(
    recipient: NotificationRecipient,
    subject: string,
    message: string,
    html?: string,
  ): Promise<NotificationResult> {
    const { host, port, secure, user, password, fromEmail } = this.emailCredentials || {};

    if (!host || !user || !password) {
      this.logger.warn('Email SMTP not configured');
      return { channel: NotificationChannel.EMAIL, success: false, error: 'Email not configured' };
    }

    const toEmail = recipient.email || await this.getCustomerEmail(recipient.customerId);
    if (!toEmail) {
      return { channel: NotificationChannel.EMAIL, success: false, error: 'No email address' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: secure || false,
        auth: { user, pass: password },
      });

      const info = await transporter.sendMail({
        from: fromEmail || user,
        to: toEmail,
        subject,
        text: message,
        html: html || message,
      });

      return {
        channel: NotificationChannel.EMAIL,
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      this.logger.error(`Email error: ${error.message}`);
      return { channel: NotificationChannel.EMAIL, success: false, error: error.message };
    }
  }

  /**
   * Get customer email from database
   */
  async getCustomerEmail(customerId?: string): Promise<string | null> {
    if (!customerId) return null;
    const customer = await this.customerModel.findOne({
      $or: [{ id: customerId }, { _id: customerId }],
    }).select('email').lean() as any;
    return customer?.email || null;
  }

  /**
   * Send cabinet notification
   */
  async sendCabinetNotification(
    recipient: NotificationRecipient,
    message: string,
    payload: InvoiceReminderPayload,
  ): Promise<NotificationResult> {
    try {
      const notification = new this.notificationModel({
        userId: recipient.customerId,
        type: 'invoice_reminder',
        title: this.getReminderTitle(payload.reminderType),
        message,
        data: {
          invoiceId: payload.invoiceId,
          dealId: payload.dealId,
          amount: payload.amount,
          dueDate: payload.dueDate,
          paymentLink: payload.paymentLink,
        },
        isRead: false,
        createdAt: new Date(),
      });

      await notification.save();
      return { channel: NotificationChannel.CABINET, success: true, messageId: notification._id };
    } catch (error) {
      return { channel: NotificationChannel.CABINET, success: false, error: error.message };
    }
  }

  /**
   * Format invoice reminder message
   */
  formatInvoiceReminderMessage(payload: InvoiceReminderPayload): string {
    const { amount, currency, dueDate, daysOverdue, reminderType } = payload;
    const dueDateStr = new Date(dueDate).toLocaleDateString('uk-UA');
    const amountStr = `${amount.toLocaleString()} ${currency}`;

    switch (reminderType) {
      case 'due_24h':
        return `⏰ BIBI Cars: Нагадування про оплату\n\nВаш рахунок на суму ${amountStr} потрібно оплатити до ${dueDateStr} (завтра).\n\nБудь ласка, здійсніть оплату вчасно, щоб уникнути затримок.`;

      case 'due_today':
        return `🔔 BIBI Cars: Термінове нагадування!\n\nСьогодні останній день оплати рахунку на суму ${amountStr}.\n\nБудь ласка, оплатіть сьогодні.`;

      case 'overdue_1d':
        return `⚠️ BIBI Cars: Прострочена оплата\n\nВаш рахунок на суму ${amountStr} прострочений на 1 день.\n\nБудь ласка, здійсніть оплату якомога швидше.`;

      case 'overdue_3d':
        return `🚨 BIBI Cars: Важливо!\n\nВаш рахунок на суму ${amountStr} прострочений на ${daysOverdue || 3} днів.\n\nЗв'яжіться з нами для вирішення питання.`;

      case 'overdue_5d':
        return `🔴 BIBI Cars: КРИТИЧНО!\n\nВаш рахунок на суму ${amountStr} прострочений на ${daysOverdue || 5} днів.\n\nТерміново зв'яжіться з нашим менеджером!`;

      default:
        return `BIBI Cars: Нагадування про рахунок на суму ${amountStr}`;
    }
  }

  /**
   * Get reminder title based on type
   */
  getReminderTitle(reminderType: string): string {
    switch (reminderType) {
      case 'due_24h':
        return 'Нагадування про оплату';
      case 'due_today':
        return 'Термінова оплата сьогодні';
      case 'overdue_1d':
        return 'Рахунок прострочений';
      case 'overdue_3d':
        return 'Важливо: Прострочена оплата';
      case 'overdue_5d':
        return 'КРИТИЧНО: Прострочений рахунок';
      default:
        return 'Нагадування';
    }
  }

  /**
   * Get customer phone from database
   */
  async getCustomerPhone(customerId?: string): Promise<string | null> {
    if (!customerId) return null;
    const customer = await this.customerModel.findOne({
      $or: [{ id: customerId }, { _id: customerId }],
    }).select('phone').lean() as any;
    return customer?.phone || null;
  }

  /**
   * Get customer Viber ID
   */
  async getCustomerViberId(customerId?: string): Promise<string | null> {
    if (!customerId) return null;
    const customer = await this.customerModel.findOne({
      $or: [{ id: customerId }, { _id: customerId }],
    }).select('viberId messengers').lean() as any;
    return customer?.viberId || customer?.messengers?.viber || null;
  }

  /**
   * Get customer Telegram ID
   */
  async getCustomerTelegramId(customerId?: string): Promise<string | null> {
    if (!customerId) return null;
    const customer = await this.customerModel.findOne({
      $or: [{ id: customerId }, { _id: customerId }],
    }).select('telegramId messengers').lean() as any;
    return customer?.telegramId || customer?.messengers?.telegram || null;
  }

  /**
   * Send reminder to staff (manager, team lead, owner)
   */
  async sendStaffReminder(
    staffId: string,
    role: 'manager' | 'teamLead' | 'owner',
    payload: InvoiceReminderPayload,
  ): Promise<NotificationResult[]> {
    const message = this.formatStaffReminderMessage(role, payload);

    // Send via Telegram (staff usually uses Telegram)
    const telegramId = await this.getStaffTelegramId(staffId);
    const results: NotificationResult[] = [];

    if (telegramId) {
      const result = await this.sendTelegram({ telegramId }, message, payload);
      results.push(result);
    }

    // Also create cabinet notification
    const cabinetResult = await this.sendCabinetNotification(
      { customerId: staffId },
      message,
      payload,
    );
    results.push(cabinetResult);

    return results;
  }

  /**
   * Format staff reminder message
   */
  formatStaffReminderMessage(role: string, payload: InvoiceReminderPayload): string {
    const { amount, currency, daysOverdue, invoiceId } = payload;
    const amountStr = `${amount.toLocaleString()} ${currency}`;

    if (role === 'owner') {
      return `🔴 КРИТИЧНА ЕСКАЛАЦІЯ\n\nРахунок #${invoiceId} на суму ${amountStr} прострочений на ${daysOverdue} днів.\n\nПотрібне ваше втручання!`;
    }

    if (role === 'teamLead') {
      return `🟠 Ескалація (L2)\n\nРахунок #${invoiceId} на суму ${amountStr} прострочений на ${daysOverdue} днів.\n\nПеревірте ситуацію з менеджером.`;
    }

    return `⚠️ Прострочений рахунок\n\nРахунок #${invoiceId} на суму ${amountStr} прострочений на ${daysOverdue || 1} днів.\n\nЗв'яжіться з клієнтом.`;
  }

  /**
   * Get staff Telegram ID
   */
  async getStaffTelegramId(staffId: string): Promise<string | null> {
    // This would query staff/users collection
    // For now, return null as placeholder
    return null;
  }
}
