import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { 
  Notification, 
  NotificationDocument, 
  NotificationType, 
  NotificationChannel,
  NotificationStatus,
} from './schemas/notification.schema';
import { TelegramService } from './telegram.service';
import { SmartIntentService, IntentLevel } from './smart-intent.service';
import { CooldownService } from './cooldown.service';

/**
 * Event Priority Map
 * Higher = more important
 */
const EVENT_PRIORITY: Record<string, number> = {
  [NotificationType.AUCTION_SOON]: 10,
  [NotificationType.PRICE_DROP]: 9,
  [NotificationType.NEW_LEAD]: 9,
  [NotificationType.WAITING_DEPOSIT_TIMEOUT]: 8,
  [NotificationType.DEAL_STATUS_CHANGED]: 7,
  [NotificationType.LISTING_SOLD]: 7,
  [NotificationType.SAVED_CAR_UPDATE]: 6,
  [NotificationType.RECOMMENDATION]: 5,
  [NotificationType.WELCOME]: 4,
};

/**
 * Smart Notification Service
 * 
 * Intelligent notification engine with:
 * - Intent-based filtering
 * - Cooldown management
 * - Priority scoring
 * - Multi-channel delivery
 */

@Injectable()
export class SmartNotificationService {
  private readonly logger = new Logger(SmartNotificationService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly telegramService: TelegramService,
    private readonly intentService: SmartIntentService,
    private readonly cooldownService: CooldownService,
  ) {}

  /**
   * Create and send smart notification
   */
  async createAndSend(params: {
    userId?: string;
    customerId?: string;
    managerId?: string;
    type: NotificationType;
    title: string;
    message: string;
    meta?: any;
    forceDeliver?: boolean;
  }): Promise<NotificationDocument | null> {
    const recipientId = params.userId || params.customerId || params.managerId;
    const priority = EVENT_PRIORITY[params.type] || 5;

    // Skip checks if force deliver
    if (!params.forceDeliver) {
      // Check cooldown
      if (recipientId && !this.cooldownService.check(recipientId, params.type)) {
        this.logger.debug(`Cooldown active for ${recipientId} - ${params.type}`);
        return null;
      }

      // Check send time (skip for high priority)
      if (priority < 8 && !this.cooldownService.isGoodSendTime()) {
        this.logger.debug(`Not good send time for ${params.type}`);
        return null;
      }

      // Check intent level (only for customers)
      if (params.customerId) {
        const intentLevel = await this.intentService.getUserIntentLevel(params.customerId);
        if (!this.intentService.shouldSendNotification(intentLevel, priority)) {
          this.logger.debug(`Intent level ${intentLevel} too low for priority ${priority}`);
          return null;
        }
      }
    }

    // Create notification record
    const notification = await this.notificationModel.create({
      id: uuidv4(),
      userId: params.userId,
      customerId: params.customerId,
      managerId: params.managerId,
      type: params.type,
      channel: NotificationChannel.TELEGRAM,
      title: params.title,
      message: this.optimizeMessage(params.message, params.customerId 
        ? await this.intentService.getUserIntentLevel(params.customerId)
        : IntentLevel.HOT),
      status: NotificationStatus.PENDING,
      priority,
      meta: params.meta,
    });

    // Dispatch immediately
    await this.dispatch(notification);

    // Record cooldown
    if (recipientId) {
      this.cooldownService.record(recipientId, params.type);
    }

    return notification;
  }

  /**
   * Dispatch notification to channel
   */
  async dispatch(notification: NotificationDocument): Promise<boolean> {
    const recipientId = notification.userId || notification.customerId || notification.managerId;

    try {
      let success = false;

      if (notification.channel === NotificationChannel.TELEGRAM) {
        success = await this.telegramService.sendNotification({
          userId: notification.userId,
          customerId: notification.customerId,
          title: notification.title,
          message: notification.message,
          link: notification.meta?.link,
          emoji: this.getEmoji(notification.type),
        });
      }

      // Update status
      notification.status = success ? NotificationStatus.SENT : NotificationStatus.FAILED;
      notification.sentAt = success ? new Date() : undefined;
      await notification.save();

      if (success) {
        this.logger.log(`Notification sent: ${notification.type} to ${recipientId}`);
      } else {
        this.logger.warn(`Notification failed: ${notification.type} to ${recipientId}`);
      }

      return success;
    } catch (error) {
      notification.status = NotificationStatus.FAILED;
      notification.error = error.message;
      await notification.save();
      
      this.logger.error(`Notification error: ${error.message}`);
      return false;
    }
  }

  /**
   * Optimize message based on intent level
   */
  private optimizeMessage(message: string, intentLevel: IntentLevel): string {
    switch (intentLevel) {
      case IntentLevel.HOT:
        return `🔥 ${message}`;
      case IntentLevel.WARM:
        return `⚡ ${message}`;
      default:
        return message;
    }
  }

  /**
   * Get emoji for notification type
   */
  private getEmoji(type: string): string {
    const emojis: Record<string, string> = {
      [NotificationType.AUCTION_SOON]: '⏰',
      [NotificationType.PRICE_DROP]: '📉',
      [NotificationType.LISTING_SOLD]: '❌',
      [NotificationType.NEW_LEAD]: '🔔',
      [NotificationType.DEAL_STATUS_CHANGED]: '📋',
      [NotificationType.WAITING_DEPOSIT_TIMEOUT]: '⚠️',
      [NotificationType.DEAL_COMPLETED]: '✅',
      [NotificationType.RECOMMENDATION]: '💡',
      [NotificationType.SAVED_CAR_UPDATE]: '🚗',
      [NotificationType.WELCOME]: '👋',
      [NotificationType.ACCOUNT_LINKED]: '🔗',
    };
    return emojis[type] || '📣';
  }

  // ============ EVENT HANDLERS ============

  @OnEvent('listing.auction_soon')
  async handleAuctionSoon(payload: {
    customerId: string;
    listingId: string;
    title: string;
    timeLeft: string;
    auctionDate: Date;
    link?: string;
  }) {
    await this.createAndSend({
      customerId: payload.customerId,
      type: NotificationType.AUCTION_SOON,
      title: 'Аукціон скоро!',
      message: `${payload.title}\nПочинається через ${payload.timeLeft}`,
      meta: {
        listingId: payload.listingId,
        listingTitle: payload.title,
        auctionDate: payload.auctionDate,
        link: payload.link,
      },
    });
  }

  @OnEvent('listing.price_changed')
  async handlePriceChanged(payload: {
    customerId: string;
    listingId: string;
    title: string;
    oldPrice: number;
    newPrice: number;
    isDrop: boolean;
    link?: string;
  }) {
    if (!payload.isDrop) return;

    const diff = payload.oldPrice - payload.newPrice;
    const percentDrop = Math.round((diff / payload.oldPrice) * 100);

    await this.createAndSend({
      customerId: payload.customerId,
      type: NotificationType.PRICE_DROP,
      title: 'Ціна знижена!',
      message: `${payload.title}\n\nБуло: $${payload.oldPrice.toLocaleString()}\nСтало: $${payload.newPrice.toLocaleString()}\n\nЗнижка: $${diff.toLocaleString()} (-${percentDrop}%)`,
      meta: {
        listingId: payload.listingId,
        listingTitle: payload.title,
        oldPrice: payload.oldPrice,
        newPrice: payload.newPrice,
        link: payload.link,
      },
    });
  }

  @OnEvent('listing.sold')
  async handleListingSold(payload: {
    customerId: string;
    listingId: string;
    title: string;
  }) {
    await this.createAndSend({
      customerId: payload.customerId,
      type: NotificationType.LISTING_SOLD,
      title: 'Авто продано',
      message: `${payload.title} було продано.\n\nМи підберемо схожі варіанти для вас.`,
      meta: {
        listingId: payload.listingId,
        listingTitle: payload.title,
      },
    });
  }

  @OnEvent('lead.created')
  async handleNewLead(payload: {
    managerId: string;
    leadId: string;
    customerName: string;
    source: string;
    vehicleTitle?: string;
  }) {
    await this.createAndSend({
      managerId: payload.managerId,
      type: NotificationType.NEW_LEAD,
      title: 'Новий лід!',
      message: `${payload.customerName}\n\nДжерело: ${payload.source}${payload.vehicleTitle ? `\nАвто: ${payload.vehicleTitle}` : ''}`,
      meta: {
        leadId: payload.leadId,
      },
      forceDeliver: true, // Always deliver new leads
    });
  }

  @OnEvent('deal.waiting_deposit_timeout')
  async handleWaitingDepositTimeout(payload: {
    managerId: string;
    dealId: string;
    customerName: string;
    vehicleTitle: string;
    waitingHours: number;
  }) {
    await this.createAndSend({
      managerId: payload.managerId,
      type: NotificationType.WAITING_DEPOSIT_TIMEOUT,
      title: 'Угода чекає депозит',
      message: `${payload.customerName}\n${payload.vehicleTitle}\n\nОчікування: ${payload.waitingHours} год.`,
      meta: {
        dealId: payload.dealId,
      },
    });
  }

  @OnEvent('deal.status_changed')
  async handleDealStatusChanged(payload: {
    customerId?: string;
    managerId?: string;
    dealId: string;
    oldStatus: string;
    newStatus: string;
    vehicleTitle: string;
  }) {
    const statusNames: Record<string, string> = {
      negotiation: 'Переговори',
      waiting_deposit: 'Очікує депозит',
      deposit_paid: 'Депозит оплачено',
      auction_bidding: 'Торги на аукціоні',
      auction_won: 'Виграно аукціон',
      shipping: 'Доставка',
      completed: 'Завершено',
    };

    if (payload.customerId) {
      await this.createAndSend({
        customerId: payload.customerId,
        type: NotificationType.DEAL_STATUS_CHANGED,
        title: 'Статус замовлення змінено',
        message: `${payload.vehicleTitle}\n\nНовий статус: ${statusNames[payload.newStatus] || payload.newStatus}`,
        meta: {
          dealId: payload.dealId,
        },
      });
    }

    if (payload.managerId) {
      await this.createAndSend({
        managerId: payload.managerId,
        type: NotificationType.DEAL_STATUS_CHANGED,
        title: 'Угода: статус змінено',
        message: `${payload.vehicleTitle}\n\n${statusNames[payload.oldStatus] || payload.oldStatus} → ${statusNames[payload.newStatus] || payload.newStatus}`,
        meta: {
          dealId: payload.dealId,
        },
      });
    }
  }

  // ============ QUERY METHODS ============

  async getNotifications(params: {
    userId?: string;
    customerId?: string;
    managerId?: string;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<any[]> {
    const filter: any = {};
    
    if (params.userId) filter.userId = params.userId;
    if (params.customerId) filter.customerId = params.customerId;
    if (params.managerId) filter.managerId = params.managerId;
    if (params.unreadOnly) filter.isRead = false;

    return this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(params.limit || 50)
      .lean();
  }

  async markAsRead(notificationId: string): Promise<boolean> {
    const result = await this.notificationModel.updateOne(
      { id: notificationId },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return result.modifiedCount > 0;
  }

  async markAllAsRead(params: {
    userId?: string;
    customerId?: string;
    managerId?: string;
  }): Promise<number> {
    const filter: any = { isRead: false };
    if (params.userId) filter.userId = params.userId;
    if (params.customerId) filter.customerId = params.customerId;
    if (params.managerId) filter.managerId = params.managerId;

    const result = await this.notificationModel.updateMany(
      filter,
      { $set: { isRead: true, readAt: new Date() } },
    );
    return result.modifiedCount;
  }

  async getUnreadCount(params: {
    userId?: string;
    customerId?: string;
    managerId?: string;
  }): Promise<number> {
    const filter: any = { isRead: false };
    if (params.userId) filter.userId = params.userId;
    if (params.customerId) filter.customerId = params.customerId;
    if (params.managerId) filter.managerId = params.managerId;

    return this.notificationModel.countDocuments(filter);
  }
}
