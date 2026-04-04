/**
 * Auto Campaign Service
 * 
 * Автоматичні кампанії по тригерах:
 * - auction < 24h → campaign
 * - user inactive > 48h → reactivation
 * - HOT user without contact → notify
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmartCampaignLog, SmartCampaignLogDocument, CampaignTrigger } from '../schemas/smart-campaign-log.schema';
import { AudienceService } from './audience.service';
import { TimingService } from './timing.service';
import { MessageAIService } from './message-ai.service';
import { AutoCallService } from '../../auto-call/auto-call.service';

@Injectable()
export class AutoCampaignService {
  private readonly logger = new Logger(AutoCampaignService.name);
  private isRunning = false;

  constructor(
    @InjectModel(SmartCampaignLog.name)
    private readonly logModel: Model<SmartCampaignLogDocument>,
    private readonly audienceService: AudienceService,
    private readonly timingService: TimingService,
    private readonly messageAI: MessageAIService,
    private readonly autoCallService: AutoCallService,
  ) {}

  /**
   * Головний cron - кожні 2 години
   */
  @Cron(CronExpression.EVERY_2_HOURS)
  async runAutoCampaigns() {
    if (this.isRunning) {
      this.logger.log('[AutoCampaign] Already running, skipping');
      return;
    }

    this.isRunning = true;
    this.logger.log('[AutoCampaign] Starting auto campaigns...');

    try {
      // 1. Аукціони які скоро
      await this.runAuctionSoonCampaigns();

      // 2. Неактивні користувачі
      await this.runInactiveUsersCampaign();

      // 3. HOT users без контакту
      await this.runHotUsersCampaign();

    } catch (error) {
      this.logger.error('[AutoCampaign] Error:', error);
    } finally {
      this.isRunning = false;
      this.logger.log('[AutoCampaign] Completed');
    }
  }

  /**
   * Кампанія "Аукціон скоро"
   */
  private async runAuctionSoonCampaigns() {
    const upcomingVins = await this.audienceService.getUpcomingAuctionVins(24);
    this.logger.log(`[AutoCampaign] Found ${upcomingVins.length} VINs with upcoming auctions`);

    for (const vin of upcomingVins) {
      const users = await this.audienceService.buildByVin(vin, { minIntent: 3 });
      
      for (const user of users) {
        await this.sendSmartMessage(user, {
          vin,
          trigger: CampaignTrigger.AUCTION_SOON,
          isUrgent: true,
        });
      }
    }
  }

  /**
   * Кампанія для неактивних користувачів (48+ годин)
   */
  private async runInactiveUsersCampaign() {
    const inactiveUsers = await this.audienceService.buildInactiveUsers(48);
    this.logger.log(`[AutoCampaign] Found ${inactiveUsers.length} inactive users`);

    for (const user of inactiveUsers) {
      await this.sendSmartMessage(user, {
        trigger: CampaignTrigger.USER_INACTIVE,
        isUrgent: false,
      });
    }
  }

  /**
   * Кампанія для HOT users
   */
  private async runHotUsersCampaign() {
    const hotUsers = await this.audienceService.buildHotUsers();
    this.logger.log(`[AutoCampaign] Found ${hotUsers.length} HOT users`);

    // Фільтруємо тих, з ким не зв'язувались
    for (const user of hotUsers) {
      const recentContact = await this.logModel.findOne({
        userId: user.userId,
        status: { $in: ['sent', 'delivered'] },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (!recentContact) {
        await this.sendSmartMessage(user, {
          trigger: CampaignTrigger.HOT_USER,
          isUrgent: true,
        });
      }
    }
  }

  /**
   * Відправити smart повідомлення
   */
  private async sendSmartMessage(
    user: any,
    options: {
      vin?: string;
      trigger: CampaignTrigger;
      isUrgent?: boolean;
    }
  ): Promise<boolean> {
    // Перевірка timing
    const timing = await this.timingService.canSendNow(user.userId, options.isUrgent);
    if (!timing.shouldSend) {
      this.logger.log(`[AutoCampaign] Skipping ${user.userId}: ${timing.reason}`);
      return false;
    }

    // Генерація повідомлення
    const message = await this.messageAI.generate({
      user,
      vin: options.vin,
      trigger: options.trigger,
    });

    // Валідація
    const validation = this.messageAI.validateMessage(message.text);
    if (!validation.valid) {
      this.logger.warn(`[AutoCampaign] Invalid message: ${validation.issues.join(', ')}`);
      return false;
    }

    // Визначення каналу
    const channel = this.determineChannel(user);

    // Створення лога
    const campaignId = `auto-${options.trigger}-${Date.now()}`;
    const log = await this.logModel.create({
      campaignId,
      userId: user.userId,
      vin: options.vin,
      trigger: options.trigger,
      channel,
      message: message.text,
      aiGenerated: message.aiGenerated,
      aiPrompt: message.prompt,
      userContext: {
        intentScore: user.intentScore,
        intentLevel: user.intentLevel,
        favoritesCount: user.favoritesCount,
        comparesCount: user.comparesCount,
        lastActivityAt: user.lastActivityAt,
        name: user.name,
        phone: user.phone,
      },
      status: 'pending',
    });

    // Відправка
    try {
      const result = await this.sendMessage(user, channel, message.text);
      
      log.status = result.success ? 'sent' : 'failed';
      log.sentAt = new Date();
      log.externalMessageId = result.messageId;
      log.errorMessage = result.error;
      await log.save();

      this.logger.log(`[AutoCampaign] Sent ${channel} to ${user.userId}: ${result.success}`);
      return result.success;

    } catch (error: any) {
      log.status = 'failed';
      log.errorMessage = error.message;
      await log.save();
      return false;
    }
  }

  /**
   * Визначити найкращий канал для користувача
   */
  private determineChannel(user: any): string {
    // Пріоритет: Telegram > SMS > WhatsApp
    if (user.telegramId) return 'telegram';
    if (user.phone) return 'sms';
    return 'sms';
  }

  /**
   * Відправити повідомлення через відповідний канал
   */
  private async sendMessage(
    user: any,
    channel: string,
    message: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      switch (channel) {
        case 'sms':
          if (!user.phone) throw new Error('No phone number');
          const smsResult = await this.autoCallService.sendSMS(user.phone, message);
          return { success: smsResult.success, messageId: smsResult.messageSid, error: smsResult.error };

        case 'telegram':
          // TODO: Implement telegram sending
          this.logger.log(`[AutoCampaign] Telegram to ${user.telegramId}: ${message}`);
          return { success: true, messageId: 'tg-' + Date.now() };

        case 'whatsapp':
          if (!user.phone) throw new Error('No phone number');
          const waResult = await this.autoCallService.sendWhatsApp(user.phone, message);
          return { success: waResult.success, messageId: waResult.messageSid, error: waResult.error };

        default:
          return { success: false, error: 'Unknown channel' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Ручний запуск кампанії по тригеру
   */
  async triggerManualCampaign(trigger: string, params: any = {}) {
    this.logger.log(`[AutoCampaign] Manual trigger: ${trigger}`);

    const users = await this.audienceService.buildForTrigger(trigger, params);
    let sent = 0;

    for (const user of users) {
      const success = await this.sendSmartMessage(user, {
        vin: params.vin,
        trigger: trigger as CampaignTrigger,
        isUrgent: params.urgent || false,
      });
      if (success) sent++;
    }

    return { trigger, totalUsers: users.length, sent };
  }

  /**
   * Статистика авто-кампаній
   */
  async getAutoCampaignStats() {
    const [totalSent, byTrigger, byChannel, todaySent] = await Promise.all([
      this.logModel.countDocuments({ status: 'sent' }),
      this.logModel.aggregate([
        { $match: { status: 'sent' } },
        { $group: { _id: '$trigger', count: { $sum: 1 } } },
      ]),
      this.logModel.aggregate([
        { $match: { status: 'sent' } },
        { $group: { _id: '$channel', count: { $sum: 1 } } },
      ]),
      this.logModel.countDocuments({
        status: 'sent',
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
    ]);

    return {
      totalSent,
      todaySent,
      byTrigger: byTrigger.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
      byChannel: byChannel.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {}),
    };
  }
}
