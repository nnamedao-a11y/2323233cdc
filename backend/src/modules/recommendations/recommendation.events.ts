import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * Recommendation Event Handler
 * 
 * Listens to recommendation events and forwards to notification system
 */
@Injectable()
export class RecommendationEventHandler {
  private readonly logger = new Logger(RecommendationEventHandler.name);

  constructor(
    @InjectModel('Customer') private customerModel: Model<any>,
  ) {}

  /**
   * Handle generated recommendation
   */
  @OnEvent('recommendation.generated')
  async handleRecommendationGenerated(payload: {
    customerId: string;
    type: string;
    title: string;
    message: string;
    priority: number;
    meta: any;
  }) {
    this.logger.log(`Recommendation generated for ${payload.customerId}: ${payload.type}`);
    
    // Forward to notification orchestrator
    // This will be picked up by the multi-channel notification system
    await this.sendToNotificationOrchestrator(payload);
  }

  /**
   * Handle auction-soon recommendation
   */
  @OnEvent('recommendation.auction_soon')
  async handleAuctionSoon(payload: {
    customerId: string;
    type: string;
    title: string;
    message: string;
    priority: number;
    meta: any;
  }) {
    this.logger.log(`Auction-soon alert for ${payload.customerId}`);
    await this.sendToNotificationOrchestrator({
      ...payload,
      priority: 9, // High priority for time-sensitive
    });
  }

  /**
   * Handle "you missed this" recommendation
   */
  @OnEvent('recommendation.you_missed')
  async handleYouMissed(payload: {
    customerId: string;
    type: string;
    title: string;
    message: string;
    priority: number;
    meta: any;
  }) {
    this.logger.log(`You-missed alert for ${payload.customerId}`);
    await this.sendToNotificationOrchestrator(payload);
  }

  /**
   * Forward to notification orchestrator
   */
  private async sendToNotificationOrchestrator(payload: {
    customerId: string;
    type: string;
    title: string;
    message: string;
    priority: number;
    meta: any;
  }) {
    try {
      // Get customer details
      const customer: any = await this.customerModel.findOne({
        $or: [{ id: payload.customerId }, { _id: payload.customerId }],
        isDeleted: false,
      }).lean();

      if (!customer) {
        this.logger.warn(`Customer not found: ${payload.customerId}`);
        return;
      }

      // Check if customer has notification channels
      const hasTelegram = !!customer.telegramId;
      const hasViber = !!customer.viberId;

      if (!hasTelegram && !hasViber) {
        this.logger.debug(`Customer ${payload.customerId} has no notification channels`);
        return;
      }

      // Format message for channels
      const formattedMessage = this.formatMessage(payload);

      // Send to Telegram if available
      if (hasTelegram && customer.telegramId) {
        await this.sendTelegramNotification(customer.telegramId, formattedMessage, payload);
      }

      // Send to Viber if high priority or Telegram not available
      if (hasViber && customer.viberId && (payload.priority >= 9 || !hasTelegram)) {
        await this.sendViberNotification(customer.viberId, formattedMessage, payload);
      }

    } catch (error) {
      this.logger.error(`Error sending notification: ${error.message}`);
    }
  }

  /**
   * Format message for notification
   */
  private formatMessage(payload: any): string {
    const { title, message, meta } = payload;
    const emoji = this.getEmoji(payload.type);
    const price = meta?.price ? `$${meta.price.toLocaleString()}` : '';
    
    let formatted = `${emoji} ${title}\n\n`;
    formatted += `${meta?.listingTitle || ''}\n`;
    if (price) formatted += `${price}\n`;
    formatted += `\n${message}`;
    
    if (meta?.link) {
      const siteUrl = process.env.PUBLIC_SITE_URL || 'https://bibi-cars.com';
      formatted += `\n\n${siteUrl}${meta.link}`;
    }

    return formatted;
  }

  /**
   * Get emoji for recommendation type
   */
  private getEmoji(type: string): string {
    const emojis: Record<string, string> = {
      'similar': '',
      'good_deal': '',
      'upgrade': '',
      'you_missed': '',
      'auction_soon': '',
    };
    return emojis[type] || '';
  }

  /**
   * Send Telegram notification
   */
  private async sendTelegramNotification(
    chatId: string,
    message: string,
    payload: any,
  ): Promise<void> {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        this.logger.warn('TELEGRAM_BOT_TOKEN not configured');
        return;
      }

      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      
      // Build inline keyboard for action buttons
      const keyboard = {
        inline_keyboard: [
          [
            { 
              text: 'View Details', 
              url: `${process.env.PUBLIC_SITE_URL || ''}${payload.meta?.link || '/'}`,
            },
          ],
        ],
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.warn(`Telegram send failed: ${error}`);
      } else {
        this.logger.log(`Telegram notification sent to ${chatId}`);
      }
    } catch (error) {
      this.logger.error(`Telegram error: ${error.message}`);
    }
  }

  /**
   * Send Viber notification
   */
  private async sendViberNotification(
    viberId: string,
    message: string,
    payload: any,
  ): Promise<void> {
    try {
      const token = process.env.VIBER_TOKEN;
      if (!token) {
        this.logger.debug('VIBER_TOKEN not configured');
        return;
      }

      const url = 'https://chatapi.viber.com/pa/send_message';
      
      // Simple text message for Viber
      const body = {
        receiver: viberId,
        type: 'text',
        text: message,
        sender: {
          name: process.env.VIBER_SENDER_NAME || 'BIBI Cars',
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Viber-Auth-Token': token,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.warn(`Viber send failed: ${error}`);
      } else {
        this.logger.log(`Viber notification sent to ${viberId}`);
      }
    } catch (error) {
      this.logger.error(`Viber error: ${error.message}`);
    }
  }
}
