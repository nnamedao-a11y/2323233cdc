/**
 * Reminder Workflow Service
 * 
 * Cron-based notifications:
 * 1. Auction soon (<24h) - нагадування
 * 2. Price changed - сповіщення
 * 3. Auction missed - пропозиція схожих
 * 4. Idle user (>24h) - реактивація
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { 
  UserNotificationLog, 
  UserNotificationLogDocument, 
  NotificationType, 
  NotificationChannel 
} from './schemas/user-notification-log.schema';
import { Favorite, FavoriteDocument } from '../user-engagement/favorites/schemas/favorite.schema';

@Injectable()
export class ReminderWorkflowService {
  private readonly logger = new Logger(ReminderWorkflowService.name);

  constructor(
    @InjectModel(UserNotificationLog.name)
    private readonly notificationLogModel: Model<UserNotificationLogDocument>,
    @InjectModel(Favorite.name)
    private readonly favoriteModel: Model<FavoriteDocument>,
  ) {}

  /**
   * Cron: кожну годину перевіряємо favorites
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processReminders() {
    this.logger.log('[Reminder] Starting reminder workflow...');

    try {
      await this.processAuctionSoon();
      await this.processIdleUsers();
    } catch (error: any) {
      this.logger.error(`[Reminder] Error: ${error.message}`);
    }

    this.logger.log('[Reminder] Reminder workflow completed');
  }

  /**
   * Auction Soon: saleDate < 24h
   */
  private async processAuctionSoon() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Знаходимо favorites де аукціон скоро
    const favorites = await this.favoriteModel.find({
      'metadataSnapshot.saleDate': { $gte: now, $lte: in24h },
    }).lean();

    this.logger.log(`[Reminder] Found ${favorites.length} favorites with auction soon`);

    for (const fav of favorites) {
      const alreadySent = await this.wasRecentlySent(
        fav.userId,
        fav.vin,
        NotificationType.AUCTION_SOON,
        6, // 6 годин cooldown
      );

      if (!alreadySent) {
        await this.sendNotification({
          userId: fav.userId,
          vin: fav.vin,
          vehicleId: fav.vehicleId,
          type: NotificationType.AUCTION_SOON,
          channel: NotificationChannel.EMAIL, // TODO: вибрати preferred channel
          metadata: {
            title: fav.metadataSnapshot?.title || fav.vin,
            saleDate: fav.metadataSnapshot?.saleDate,
            price: fav.metadataSnapshot?.price,
          },
        });
      }
    }
  }

  /**
   * Idle Users: додали в favorites >24h тому і нічого не робили
   */
  private async processIdleUsers() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Користувачі що додали favorite 24-48h тому
    const idleFavorites = await this.favoriteModel.aggregate([
      {
        $match: {
          createdAt: { $gte: twoDaysAgo, $lte: oneDayAgo },
        },
      },
      {
        $group: {
          _id: '$userId',
          favorites: { $push: { vin: '$vin', title: '$metadataSnapshot.title' } },
          count: { $sum: 1 },
        },
      },
    ]);

    this.logger.log(`[Reminder] Found ${idleFavorites.length} idle users`);

    for (const user of idleFavorites) {
      const alreadySent = await this.wasRecentlySent(
        user._id,
        'idle_reminder',
        NotificationType.IDLE_USER,
        24, // 24 години cooldown
      );

      if (!alreadySent) {
        await this.sendNotification({
          userId: user._id,
          vin: 'idle_reminder',
          type: NotificationType.IDLE_USER,
          channel: NotificationChannel.EMAIL,
          metadata: {
            favoritesCount: user.count,
            favorites: user.favorites.slice(0, 3), // Перші 3
          },
        });
      }
    }
  }

  /**
   * Перевірити чи нотифікація вже була надіслана
   */
  private async wasRecentlySent(
    userId: string,
    vin: string,
    type: NotificationType,
    hoursAgo: number,
  ): Promise<boolean> {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    
    const count = await this.notificationLogModel.countDocuments({
      userId,
      vin,
      type,
      createdAt: { $gte: since },
    });

    return count > 0;
  }

  /**
   * Надіслати нотифікацію
   */
  private async sendNotification(params: {
    userId: string;
    vin: string;
    vehicleId?: string;
    type: NotificationType;
    channel: NotificationChannel;
    metadata?: Record<string, any>;
  }) {
    const { userId, vin, vehicleId, type, channel, metadata } = params;

    // Логуємо нотифікацію
    const log = await this.notificationLogModel.create({
      userId,
      vin,
      vehicleId,
      type,
      channel,
      metadata,
      delivered: false,
    });

    try {
      // TODO: Інтегрувати з реальним notification service
      // await this.emailService.send(...)
      // await this.telegramService.send(...)
      
      this.logger.log(`[Reminder] SEND ${type} to user ${userId} for VIN ${vin}`);

      // Mark as delivered
      log.delivered = true;
      log.deliveredAt = new Date();
      await log.save();

    } catch (error: any) {
      log.error = error.message;
      await log.save();
      this.logger.error(`[Reminder] Failed to send ${type} to ${userId}: ${error.message}`);
    }
  }

  /**
   * Manual trigger: Auction Soon для конкретного user
   */
  async triggerAuctionSoonReminder(userId: string, vin: string, vehicleData: any) {
    await this.sendNotification({
      userId,
      vin,
      vehicleId: vehicleData.vehicleId,
      type: NotificationType.AUCTION_SOON,
      channel: NotificationChannel.EMAIL,
      metadata: vehicleData,
    });
  }

  /**
   * Manual trigger: Price Changed
   */
  async triggerPriceChanged(userId: string, vin: string, oldPrice: number, newPrice: number) {
    await this.sendNotification({
      userId,
      vin,
      type: NotificationType.PRICE_CHANGED,
      channel: NotificationChannel.EMAIL,
      metadata: { oldPrice, newPrice, change: newPrice - oldPrice },
    });
  }

  /**
   * Admin: Get notification logs
   */
  async getNotificationLogs(page = 1, limit = 100) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.notificationLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.notificationLogModel.countDocuments(),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Admin: Analytics
   */
  async getAnalytics() {
    const byType = await this.notificationLogModel.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, delivered: { $sum: { $cond: ['$delivered', 1, 0] } } } },
    ]);

    const last24h = await this.notificationLogModel.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const deliveryRate = await this.notificationLogModel.aggregate([
      { $group: { _id: null, total: { $sum: 1 }, delivered: { $sum: { $cond: ['$delivered', 1, 0] } } } },
    ]);

    return {
      byType,
      last24h,
      deliveryRate: deliveryRate[0] ? (deliveryRate[0].delivered / deliveryRate[0].total * 100).toFixed(1) : 0,
    };
  }
}
