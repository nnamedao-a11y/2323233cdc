/**
 * Smart Campaign Service
 * 
 * Головний сервіс для AI-powered кампаній
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmartCampaignLog, SmartCampaignLogDocument, CampaignTrigger } from './schemas/smart-campaign-log.schema';
import { AudienceService } from './services/audience.service';
import { TimingService } from './services/timing.service';
import { MessageAIService } from './services/message-ai.service';
import { AutoCampaignService } from './services/auto-campaign.service';
import { CampaignFeedbackService } from './services/campaign-feedback.service';
import { AutoCallService } from '../auto-call/auto-call.service';

export interface SmartCampaignOptions {
  vin?: string;
  trigger?: string;
  channel?: string;
  customMessage?: string;
  useAI?: boolean;
  urgent?: boolean;
  filters?: {
    minIntent?: number;
    onlyHot?: boolean;
  };
}

@Injectable()
export class SmartCampaignService {
  private readonly logger = new Logger(SmartCampaignService.name);

  constructor(
    @InjectModel(SmartCampaignLog.name)
    private readonly logModel: Model<SmartCampaignLogDocument>,
    private readonly audienceService: AudienceService,
    private readonly timingService: TimingService,
    private readonly messageAI: MessageAIService,
    private readonly autoCampaignService: AutoCampaignService,
    private readonly feedbackService: CampaignFeedbackService,
    private readonly autoCallService: AutoCallService,
  ) {}

  /**
   * Запустити smart campaign
   */
  async runSmartCampaign(options: SmartCampaignOptions, createdBy: string) {
    const campaignId = `smart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`[SmartCampaign] Starting campaign ${campaignId}`);

    // 1. Знайти аудиторію
    let users;
    if (options.vin) {
      users = await this.audienceService.buildByVin(options.vin, {
        minIntent: options.filters?.minIntent || 0,
        onlyHot: options.filters?.onlyHot || false,
      });
    } else if (options.trigger === 'hot_users') {
      users = await this.audienceService.buildHotUsers();
    } else if (options.trigger === 'inactive') {
      users = await this.audienceService.buildInactiveUsers(48);
    } else {
      return { error: 'No VIN or trigger specified' };
    }

    this.logger.log(`[SmartCampaign] Found ${users.length} users`);

    const results = {
      campaignId,
      totalUsers: users.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      logs: [] as any[],
    };

    // 2. Відправити кожному користувачу
    for (const user of users) {
      // Перевірка timing
      const timing = await this.timingService.canSendNow(user.userId, options.urgent);
      if (!timing.shouldSend) {
        results.skipped++;
        continue;
      }

      // Генерація повідомлення
      let messageText = options.customMessage;
      let aiGenerated = false;
      let aiPrompt;

      if (!messageText && options.useAI !== false) {
        const generated = await this.messageAI.generate({
          user,
          vin: options.vin,
          trigger: options.trigger,
        });
        messageText = generated.text;
        aiGenerated = generated.aiGenerated;
        aiPrompt = generated.prompt;
      }

      if (!messageText) {
        results.failed++;
        continue;
      }

      // Визначення каналу
      const channel = options.channel || this.determineChannel(user);

      // Створення лога
      const log = await this.logModel.create({
        campaignId,
        userId: user.userId,
        vin: options.vin,
        trigger: (options.trigger as CampaignTrigger) || CampaignTrigger.MANUAL,
        channel,
        message: messageText,
        aiGenerated,
        aiPrompt,
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
        const sendResult = await this.sendMessage(user, channel, messageText);
        
        log.status = sendResult.success ? 'sent' : 'failed';
        log.sentAt = new Date();
        log.externalMessageId = sendResult.messageId;
        log.errorMessage = sendResult.error;
        await log.save();

        if (sendResult.success) {
          results.sent++;
        } else {
          results.failed++;
        }

        results.logs.push({
          userId: user.userId,
          status: log.status,
          channel,
          aiGenerated,
        });

      } catch (error: any) {
        log.status = 'failed';
        log.errorMessage = error.message;
        await log.save();
        results.failed++;
      }
    }

    this.logger.log(`[SmartCampaign] Completed: sent=${results.sent}, failed=${results.failed}, skipped=${results.skipped}`);
    return results;
  }

  /**
   * Визначити найкращий канал
   */
  private determineChannel(user: any): string {
    if (user.telegramId) return 'telegram';
    if (user.phone) return 'sms';
    return 'sms';
  }

  /**
   * Відправити повідомлення
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
          this.logger.log(`[SmartCampaign] Telegram to ${user.telegramId}: ${message}`);
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
   * Preview кампанії (без відправки)
   */
  async previewCampaign(options: SmartCampaignOptions) {
    let users;
    if (options.vin) {
      users = await this.audienceService.buildByVin(options.vin, {
        minIntent: options.filters?.minIntent || 0,
        onlyHot: options.filters?.onlyHot || false,
      });
    } else if (options.trigger === 'hot_users') {
      users = await this.audienceService.buildHotUsers();
    } else if (options.trigger === 'inactive') {
      users = await this.audienceService.buildInactiveUsers(48);
    } else {
      return { error: 'No VIN or trigger specified' };
    }

    // Генеруємо приклад повідомлення
    const sampleMessage = users.length > 0
      ? await this.messageAI.generate({
          user: users[0],
          vin: options.vin,
          trigger: options.trigger,
        })
      : null;

    return {
      totalUsers: users.length,
      users: users.slice(0, 10), // Перші 10 для preview
      sampleMessage,
      estimatedCost: users.length * 0.05, // ~$0.05 per SMS
    };
  }

  /**
   * Статистика smart campaigns
   */
  async getStats() {
    const [overall, byTrigger, byChannel, feedback] = await Promise.all([
      this.logModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      this.logModel.aggregate([
        { $match: { status: 'sent' } },
        { $group: { _id: '$trigger', count: { $sum: 1 } } },
      ]),
      this.logModel.aggregate([
        { $match: { status: 'sent' } },
        { $group: { _id: '$channel', count: { $sum: 1 } } },
      ]),
      this.feedbackService.getOverallStats(),
    ]);

    const aiStats = await this.logModel.aggregate([
      { $match: { status: 'sent' } },
      {
        $group: {
          _id: '$aiGenerated',
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      byStatus: overall.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      byTrigger: byTrigger.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
      byChannel: byChannel.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {}),
      aiGenerated: aiStats.find(a => a._id === true)?.count || 0,
      templateGenerated: aiStats.find(a => a._id === false)?.count || 0,
      feedback,
    };
  }

  /**
   * Історія кампаній
   */
  async getHistory(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    
    const [items, total] = await Promise.all([
      this.logModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.logModel.countDocuments(),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }
}
