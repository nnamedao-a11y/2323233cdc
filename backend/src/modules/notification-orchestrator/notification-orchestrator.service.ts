/**
 * Notification Orchestrator Service
 * 
 * Multi-channel delivery with priority routing:
 * 1. Telegram (rich UX)
 * 2. Viber (mass reach)
 * 3. Email (fallback)
 * 
 * Features:
 * - Channel priority routing
 * - Double-send for high priority
 * - Delivery tracking
 * - Retry/fallback logic
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { ViberService } from '../viber-bot/viber.service';

// Channel priority order
const CHANNEL_PRIORITY = ['telegram', 'viber', 'email'] as const;
type Channel = typeof CHANNEL_PRIORITY[number];

// Priority thresholds
const DOUBLE_SEND_THRESHOLD = 9; // Send to both Telegram + Viber
const HIGH_PRIORITY_THRESHOLD = 7;

export interface NotificationPayload {
  userId?: string;
  customerId?: string;
  managerId?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  priority?: number; // 1-10
  channels?: Channel[];
  meta?: any;
}

export interface DeliveryResult {
  success: boolean;
  channel: Channel;
  error?: string;
  timestamp: Date;
}

@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    private readonly telegram: TelegramBotService,
    private readonly viber: ViberService,
    @InjectModel('Customer') private readonly customerModel: Model<any>,
    @InjectModel('NotificationDelivery') private readonly deliveryModel: Model<any>,
  ) {}

  /**
   * Dispatch notification through available channels
   */
  async dispatch(payload: NotificationPayload): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];
    const priority = payload.priority || 5;

    // Get user/customer info
    const user = await this.getUser(payload);
    if (!user) {
      this.logger.warn(`No user found for notification: ${JSON.stringify(payload)}`);
      return results;
    }

    // Determine channels to use
    const channels = this.determineChannels(user, priority, payload.channels);
    this.logger.debug(`Dispatching to channels: ${channels.join(', ')} for priority ${priority}`);

    // Send to each channel
    for (const channel of channels) {
      const result = await this.sendToChannel(channel, user, payload);
      results.push(result);

      // Save delivery record
      await this.saveDeliveryRecord(payload, result, user);

      // If success and not double-send mode, stop
      if (result.success && priority < DOUBLE_SEND_THRESHOLD) {
        break;
      }
    }

    return results;
  }

  /**
   * Determine which channels to use based on user and priority
   */
  private determineChannels(
    user: any,
    priority: number,
    requestedChannels?: Channel[],
  ): Channel[] {
    const available: Channel[] = [];

    // Check available channels
    if (user.telegramId) available.push('telegram');
    if (user.viberId) available.push('viber');
    if (user.email) available.push('email');

    // Filter by requested channels if specified
    if (requestedChannels?.length) {
      return available.filter(c => requestedChannels.includes(c));
    }

    // High priority: use multiple channels
    if (priority >= DOUBLE_SEND_THRESHOLD) {
      return available.filter(c => c === 'telegram' || c === 'viber');
    }

    // Normal: use first available by priority
    return available.slice(0, 1);
  }

  /**
   * Send to specific channel
   */
  private async sendToChannel(
    channel: Channel,
    user: any,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const timestamp = new Date();

    try {
      switch (channel) {
        case 'telegram':
          const telegramSuccess = await this.sendTelegram(user.telegramId, payload);
          return { success: telegramSuccess, channel, timestamp };

        case 'viber':
          const viberSuccess = await this.sendViber(user.viberId, payload);
          return { success: viberSuccess, channel, timestamp };

        case 'email':
          // Email integration placeholder
          this.logger.debug('Email channel not implemented yet');
          return { success: false, channel, error: 'Not implemented', timestamp };

        default:
          return { success: false, channel, error: 'Unknown channel', timestamp };
      }
    } catch (error) {
      this.logger.error(`Error sending to ${channel}: ${error}`);
      return { success: false, channel, error: String(error), timestamp };
    }
  }

  /**
   * Send via Telegram
   */
  private async sendTelegram(telegramId: string, payload: NotificationPayload): Promise<boolean> {
    if (!telegramId) return false;

    const result = await this.telegram.sendNotification(
      telegramId,
      payload.title,
      payload.message,
      payload.link,
    );

    return result;
  }

  /**
   * Send via Viber
   */
  private async sendViber(viberId: string, payload: NotificationPayload): Promise<boolean> {
    if (!viberId) return false;

    const result = await this.viber.sendNotification(
      viberId,
      payload.title,
      payload.message,
      payload.link,
    );

    return result;
  }

  /**
   * Get user by ID
   */
  private async getUser(payload: NotificationPayload): Promise<any | null> {
    const id = payload.customerId || payload.userId;
    if (!id) return null;

    // Find by custom id first
    let user = await this.customerModel.findOne({ id }).lean();
    
    // Try by ObjectId
    if (!user && /^[a-f\d]{24}$/i.test(id)) {
      user = await this.customerModel.findById(id).lean();
    }

    return user;
  }

  /**
   * Save delivery record for tracking
   */
  private async saveDeliveryRecord(
    payload: NotificationPayload,
    result: DeliveryResult,
    user: any,
  ): Promise<void> {
    try {
      await this.deliveryModel.create({
        userId: user.id || String(user._id),
        notificationType: payload.type,
        channel: result.channel,
        status: result.success ? 'sent' : 'failed',
        error: result.error,
        priority: payload.priority || 5,
        timestamp: result.timestamp,
        meta: payload.meta,
      });
    } catch (error) {
      this.logger.error(`Error saving delivery record: ${error}`);
    }
  }

  /**
   * Get delivery stats for a user
   */
  async getDeliveryStats(userId: string): Promise<any> {
    const [total, sent, failed, byChannel] = await Promise.all([
      this.deliveryModel.countDocuments({ userId }),
      this.deliveryModel.countDocuments({ userId, status: 'sent' }),
      this.deliveryModel.countDocuments({ userId, status: 'failed' }),
      this.deliveryModel.aggregate([
        { $match: { userId } },
        { $group: { _id: '$channel', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      total,
      sent,
      failed,
      successRate: total > 0 ? (sent / total * 100).toFixed(1) : 0,
      byChannel: Object.fromEntries(byChannel.map((x: any) => [x._id, x.count])),
    };
  }
}
