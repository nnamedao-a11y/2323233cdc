/**
 * Viber Bot - API Service
 * 
 * Low-level Viber API wrapper
 * Simple messaging channel (not complex like Telegram)
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

interface SendMessageOptions {
  userId: string;
  text: string;
  keyboard?: any;
}

@Injectable()
export class ViberService {
  private readonly logger = new Logger(ViberService.name);
  private readonly token = process.env.VIBER_TOKEN;
  private readonly senderName = process.env.VIBER_SENDER_NAME || 'BIBI Cars';
  private readonly senderAvatar = process.env.VIBER_SENDER_AVATAR || '';

  private get isConfigured(): boolean {
    return !!this.token;
  }

  /**
   * Send text message
   */
  async sendText(userId: string, text: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('Viber not configured (VIBER_TOKEN missing)');
      return false;
    }

    try {
      await axios.post(
        'https://chatapi.viber.com/pa/send_message',
        {
          receiver: userId,
          type: 'text',
          text,
          sender: {
            name: this.senderName,
            avatar: this.senderAvatar,
          },
        },
        {
          headers: {
            'X-Viber-Auth-Token': this.token,
          },
        },
      );

      this.logger.debug(`Viber message sent to ${userId}`);
      return true;
    } catch (error) {
      this.handleError(error, 'sendText');
      return false;
    }
  }

  /**
   * Send message with keyboard buttons
   */
  async sendKeyboard(userId: string, text: string, buttons: any[]): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('Viber not configured');
      return false;
    }

    try {
      await axios.post(
        'https://chatapi.viber.com/pa/send_message',
        {
          receiver: userId,
          type: 'text',
          text,
          sender: {
            name: this.senderName,
            avatar: this.senderAvatar,
          },
          keyboard: {
            Type: 'keyboard',
            DefaultHeight: false,
            Buttons: buttons,
          },
        },
        {
          headers: {
            'X-Viber-Auth-Token': this.token,
          },
        },
      );

      return true;
    } catch (error) {
      this.handleError(error, 'sendKeyboard');
      return false;
    }
  }

  /**
   * Send notification (simple text for relay)
   */
  async sendNotification(
    userId: string,
    title: string,
    message: string,
    link?: string,
  ): Promise<boolean> {
    const text = link
      ? `${title}\n\n${message}\n\n👉 ${link}`
      : `${title}\n\n${message}`;

    return this.sendText(userId, text);
  }

  /**
   * Set webhook
   */
  async setWebhook(url: string): Promise<any> {
    if (!this.isConfigured) {
      this.logger.warn('Cannot set webhook: VIBER_TOKEN not configured');
      return null;
    }

    try {
      const response = await axios.post(
        'https://chatapi.viber.com/pa/set_webhook',
        {
          url,
          event_types: [
            'delivered',
            'seen',
            'failed',
            'subscribed',
            'unsubscribed',
            'conversation_started',
            'message',
          ],
          send_name: true,
          send_photo: true,
        },
        {
          headers: {
            'X-Viber-Auth-Token': this.token,
          },
        },
      );

      this.logger.log(`Viber webhook set to: ${url}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'setWebhook');
      return null;
    }
  }

  /**
   * Get account info
   */
  async getAccountInfo(): Promise<any> {
    if (!this.isConfigured) return null;

    try {
      const response = await axios.post(
        'https://chatapi.viber.com/pa/get_account_info',
        {},
        {
          headers: {
            'X-Viber-Auth-Token': this.token,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'getAccountInfo');
      return null;
    }
  }

  private handleError(error: unknown, context: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Viber API error in ${context}: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data)}`,
      );
    } else {
      this.logger.error(`Error in ${context}: ${error}`);
    }
  }
}
