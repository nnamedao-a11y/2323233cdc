/**
 * BIBI Cars Telegram Bot - API Service
 * 
 * Low-level Telegram API wrapper
 * Credentials loaded from IntegrationConfigService (admin panel)
 */

import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';

interface SendMessageOptions {
  chatId: string | number;
  text: string;
  replyMarkup?: any;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotService.name);
  private token: string | null = null;
  private ownerChatId: string | null = null;

  constructor(
    @Inject(forwardRef(() => IntegrationConfigService))
    private integrationConfigService: IntegrationConfigService,
  ) {}

  async onModuleInit() {
    await this.loadCredentials();
  }

  private async loadCredentials(): Promise<void> {
    try {
      const credentials = await this.integrationConfigService.getCredentials(IntegrationProvider.TELEGRAM);
      this.token = credentials?.botToken || process.env.TELEGRAM_BOT_TOKEN || null;
      this.ownerChatId = credentials?.ownerChatId || process.env.TELEGRAM_OWNER_CHAT_ID || null;
      
      if (this.token) {
        this.logger.log('Telegram credentials loaded');
      } else {
        this.logger.warn('Telegram bot token not configured');
      }
    } catch (error) {
      this.logger.error(`Failed to load Telegram credentials: ${error.message}`);
    }
  }

  async refreshCredentials(): Promise<void> {
    await this.loadCredentials();
  }

  private get baseUrl() {
    return `https://api.telegram.org/bot${this.token}`;
  }

  getOwnerChatId(): string | null {
    return this.ownerChatId;
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  async sendMessage(options: SendMessageOptions): Promise<any> {
    const { chatId, text, replyMarkup, parseMode = 'HTML' } = options;

    if (!this.token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not configured');
      return null;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
        parse_mode: parseMode,
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'sendMessage');
      return null;
    }
  }

  async editMessage(
    chatId: string | number,
    messageId: number,
    text: string,
    replyMarkup?: any,
  ): Promise<any> {
    if (!this.token) return null;

    try {
      const response = await axios.post(`${this.baseUrl}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
        parse_mode: 'HTML',
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'editMessage');
      return null;
    }
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false,
  ): Promise<any> {
    if (!this.token) return null;

    try {
      const response = await axios.post(`${this.baseUrl}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'answerCallbackQuery');
      return null;
    }
  }

  async setWebhook(url: string): Promise<any> {
    if (!this.token) {
      this.logger.warn('Cannot set webhook: TELEGRAM_BOT_TOKEN not configured');
      return null;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/setWebhook`, {
        url,
        allowed_updates: ['message', 'callback_query'],
      });

      this.logger.log(`Webhook set to: ${url}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'setWebhook');
      return null;
    }
  }

  async deleteWebhook(): Promise<any> {
    if (!this.token) return null;

    try {
      const response = await axios.post(`${this.baseUrl}/deleteWebhook`);
      this.logger.log('Webhook deleted');
      return response.data;
    } catch (error) {
      this.handleError(error, 'deleteWebhook');
      return null;
    }
  }

  async getMe(): Promise<any> {
    if (!this.token) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/getMe`);
      return response.data.result;
    } catch (error) {
      this.handleError(error, 'getMe');
      return null;
    }
  }

  async sendNotification(
    telegramId: string,
    title: string,
    message: string,
    link?: string,
  ): Promise<boolean> {
    const text = link
      ? `<b>${title}</b>\n\n${message}\n\n<a href="${link}">Переглянути →</a>`
      : `<b>${title}</b>\n\n${message}`;

    const result = await this.sendMessage({
      chatId: telegramId,
      text,
    });

    return !!result;
  }

  private handleError(error: unknown, context: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Telegram API error in ${context}: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data)}`,
      );
    } else {
      this.logger.error(`Error in ${context}: ${error}`);
    }
  }
}
