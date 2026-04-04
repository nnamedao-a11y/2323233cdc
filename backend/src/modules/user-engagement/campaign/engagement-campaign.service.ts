/**
 * Engagement Campaign Service
 * 
 * Ядро системи масових розсилок:
 * - Знаходить користувачів по VIN (favorites/compare)
 * - Відправляє повідомлення (SMS/Telegram/WhatsApp)
 * - Логує результати
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EngagementCampaign, EngagementCampaignDocument, CampaignChannel, CampaignStatus } from './schemas/engagement-campaign.schema';
import { Favorite, FavoriteDocument } from '../favorites/schemas/favorite.schema';
import { CompareList, CompareListDocument } from '../compare/schemas/compare-list.schema';
import { IntentScore, IntentScoreDocument, IntentLevel } from '../../reminder-workflow/schemas/intent-score.schema';
import { AutoCallService } from '../../auto-call/auto-call.service';
import { TelegramBotService } from '../../telegram-bot/telegram-bot.service';
import { CreateCampaignDto } from './dto/campaign.dto';

// Message templates
export const CAMPAIGN_TEMPLATES = {
  auction_soon: {
    id: 'auction_soon',
    name: '🔥 Аукціон скоро',
    message: 'Авто {vin}, яке ви дивились, йде на аукціон через 12 годин. Встигніть зробити ставку!',
  },
  price_drop: {
    id: 'price_drop',
    name: '💰 Зниження ціни',
    message: 'Ціна на обране вами авто {vin} знизилась! Перегляньте нову пропозицію.',
  },
  push_deal: {
    id: 'push_deal',
    name: '⚡ Дожим',
    message: 'Готові зафіксувати вигідну ціну на {vin} для вас прямо зараз. Зателефонуйте нам!',
  },
  inactive: {
    id: 'inactive',
    name: '🔄 Реактивація',
    message: 'Ви дивились авто {vin}. Воно ще доступне! Чи актуальний для вас цей варіант?',
  },
  new_similar: {
    id: 'new_similar',
    name: '🚗 Схоже авто',
    message: 'Знайшли схоже авто на те, що ви шукали ({vin}). Перегляньте нові пропозиції!',
  },
};

@Injectable()
export class EngagementCampaignService {
  private readonly logger = new Logger(EngagementCampaignService.name);

  constructor(
    @InjectModel(EngagementCampaign.name)
    private readonly campaignModel: Model<EngagementCampaignDocument>,
    @InjectModel(Favorite.name)
    private readonly favoriteModel: Model<FavoriteDocument>,
    @InjectModel(CompareList.name)
    private readonly compareModel: Model<CompareListDocument>,
    @InjectModel(IntentScore.name)
    private readonly intentModel: Model<IntentScoreDocument>,
    @Inject(forwardRef(() => AutoCallService))
    private readonly autoCallService: AutoCallService,
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramService: TelegramBotService,
  ) {}

  /**
   * Головний метод - запуск кампанії
   */
  async runCampaign(dto: CreateCampaignDto, createdBy: string): Promise<EngagementCampaign> {
    const vin = dto.vin.trim().toUpperCase();
    
    this.logger.log(`[Campaign] Starting campaign for VIN ${vin}, channel: ${dto.channel}`);

    // 1. Створюємо кампанію
    const campaign = await this.campaignModel.create({
      vin,
      channel: dto.channel,
      message: dto.message,
      filter: {
        favorites: dto.filterFavorites ?? true,
        compare: dto.filterCompare ?? true,
        intentMin: dto.intentMin ?? 0,
        onlyHot: dto.onlyHot ?? false,
      },
      status: CampaignStatus.SENDING,
      createdBy,
    });

    // 2. Знаходимо цільову аудиторію
    const users = await this.getTargetAudience(vin, {
      favorites: dto.filterFavorites ?? true,
      compare: dto.filterCompare ?? true,
      intentMin: dto.intentMin ?? 0,
      onlyHot: dto.onlyHot ?? false,
    });

    campaign.totalUsers = users.length;
    await campaign.save();

    this.logger.log(`[Campaign] Found ${users.length} target users for VIN ${vin}`);

    // 3. Відправляємо повідомлення
    const results: Array<{userId: string; status: string; error?: string; sentAt: Date}> = [];
    for (const user of users) {
      try {
        await this.sendMessage(user, dto.channel, dto.message, vin);
        results.push({
          userId: user.id,
          status: 'sent',
          sentAt: new Date(),
        });
        campaign.sentCount++;
      } catch (error: any) {
        results.push({
          userId: user.id,
          status: 'failed',
          error: error.message,
          sentAt: new Date(),
        });
        campaign.failedCount++;
      }
    }

    // 4. Оновлюємо статус
    campaign.results = results as any;
    campaign.status = CampaignStatus.COMPLETED;
    campaign.completedAt = new Date();
    await campaign.save();

    this.logger.log(`[Campaign] Completed! Sent: ${campaign.sentCount}, Failed: ${campaign.failedCount}`);

    return campaign;
  }

  /**
   * Знайти цільову аудиторію по VIN
   */
  async getTargetAudience(vin: string, filter: {
    favorites?: boolean;
    compare?: boolean;
    intentMin?: number;
    onlyHot?: boolean;
  }) {
    const userIds = new Set<string>();

    // Favorites
    if (filter.favorites !== false) {
      const favorites = await this.favoriteModel.find({ vin }).lean();
      favorites.forEach(f => userIds.add(f.userId));
    }

    // Compare
    if (filter.compare !== false) {
      const compares = await this.compareModel.find({ 'items.vin': vin }).lean();
      compares.forEach(c => userIds.add(c.userId));
    }

    if (userIds.size === 0) return [];

    // Фільтруємо по intent score
    let query: any = { userId: { $in: Array.from(userIds) } };
    
    if (filter.intentMin && filter.intentMin > 0) {
      query.score = { $gte: filter.intentMin };
    }
    
    if (filter.onlyHot) {
      query.level = IntentLevel.HOT;
    }

    const intents = await this.intentModel.find(query).lean();

    // Повертаємо збагачені дані користувачів
    return intents.map(intent => ({
      id: intent.userId,
      intentScore: intent.score,
      intentLevel: intent.level,
      phone: intent.context?.phone,
      email: intent.context?.email,
      name: intent.context?.name,
      telegramId: intent.context?.telegramId,
    }));
  }

  /**
   * Відправити повідомлення користувачу
   */
  private async sendMessage(user: any, channel: CampaignChannel, message: string, vin: string) {
    // Заміна плейсхолдерів
    const finalMessage = message
      .replace('{vin}', vin)
      .replace('{name}', user.name || 'Клієнт')
      .replace('{score}', user.intentScore?.toString() || '0');

    switch (channel) {
      case CampaignChannel.SMS:
        if (!user.phone) throw new Error('No phone number');
        await this.autoCallService.sendSMS(user.phone, finalMessage);
        break;

      case CampaignChannel.TELEGRAM:
        if (!user.telegramId) throw new Error('No Telegram ID');
        await this.telegramService.sendMessage({
          chatId: user.telegramId,
          text: finalMessage,
        });
        break;

      case CampaignChannel.WHATSAPP:
        if (!user.phone) throw new Error('No phone number');
        await this.autoCallService.sendWhatsApp(user.phone, finalMessage);
        break;

      case CampaignChannel.EMAIL:
        // TODO: Integrate with email service
        this.logger.log(`[Campaign] Email to ${user.email}: ${finalMessage}`);
        break;
    }
  }

  /**
   * Отримати шаблони кампаній
   */
  getTemplates() {
    return Object.values(CAMPAIGN_TEMPLATES);
  }

  /**
   * Запустити кампанію по шаблону
   */
  async runFromTemplate(templateId: string, vin: string, channel: CampaignChannel, createdBy: string) {
    const template = CAMPAIGN_TEMPLATES[templateId as keyof typeof CAMPAIGN_TEMPLATES];
    if (!template) throw new Error(`Template ${templateId} not found`);

    return this.runCampaign({
      vin,
      channel,
      message: template.message,
      filterFavorites: true,
      filterCompare: true,
    }, createdBy);
  }

  /**
   * Статистика по VIN - скільки користувачів зацікавлені
   */
  async getVinStats(vin: string) {
    const [favoritesCount, comparesCount, hotUsers] = await Promise.all([
      this.favoriteModel.countDocuments({ vin }),
      this.compareModel.countDocuments({ 'items.vin': vin }),
      this.getHotUsersForVin(vin),
    ]);

    return {
      vin,
      favoritesCount,
      comparesCount,
      hotUsersCount: hotUsers.length,
      totalInterested: favoritesCount + comparesCount,
    };
  }

  /**
   * HOT користувачі для VIN
   */
  private async getHotUsersForVin(vin: string) {
    const userIds = new Set<string>();
    
    const favorites = await this.favoriteModel.find({ vin }).lean();
    favorites.forEach(f => userIds.add(f.userId));
    
    const compares = await this.compareModel.find({ 'items.vin': vin }).lean();
    compares.forEach(c => userIds.add(c.userId));

    return this.intentModel.find({
      userId: { $in: Array.from(userIds) },
      level: IntentLevel.HOT,
    }).lean();
  }

  /**
   * Топ VIN по кількості favorites/compare
   */
  async getTopVehicles(limit = 50) {
    // Aggregation for favorites
    const topFavorites = await this.favoriteModel.aggregate([
      {
        $group: {
          _id: '$vin',
          favoritesCount: { $sum: 1 },
          users: { $addToSet: '$userId' },
        },
      },
      { $sort: { favoritesCount: -1 } },
      { $limit: limit },
    ]);

    // Aggregation for compares
    const topCompares = await this.compareModel.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.vin',
          comparesCount: { $sum: 1 },
          users: { $addToSet: '$userId' },
        },
      },
      { $sort: { comparesCount: -1 } },
      { $limit: limit },
    ]);

    // Merge results
    const vinMap = new Map<string, any>();

    for (const f of topFavorites) {
      vinMap.set(f._id, {
        vin: f._id,
        favoritesCount: f.favoritesCount,
        comparesCount: 0,
        userIds: new Set(f.users),
      });
    }

    for (const c of topCompares) {
      const existing = vinMap.get(c._id);
      if (existing) {
        existing.comparesCount = c.comparesCount;
        c.users.forEach((u: string) => existing.userIds.add(u));
      } else {
        vinMap.set(c._id, {
          vin: c._id,
          favoritesCount: 0,
          comparesCount: c.comparesCount,
          userIds: new Set(c.users),
        });
      }
    }

    // Get HOT users count for each VIN
    const results: Array<{
      vin: string;
      favoritesCount: number;
      comparesCount: number;
      totalInterested: number;
      hotUsersCount: number;
    }> = [];
    for (const [vin, data] of vinMap.entries()) {
      const hotUsers = await this.intentModel.countDocuments({
        userId: { $in: Array.from(data.userIds) },
        level: IntentLevel.HOT,
      });

      results.push({
        vin,
        favoritesCount: data.favoritesCount,
        comparesCount: data.comparesCount,
        totalInterested: data.userIds.size,
        hotUsersCount: hotUsers,
      });
    }

    // Sort by total interested
    return results
      .sort((a, b) => b.totalInterested - a.totalInterested)
      .slice(0, limit);
  }

  /**
   * Топ користувачів по активності
   */
  async getTopUsers(limit = 50) {
    return this.intentModel
      .find()
      .sort({ score: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Історія кампаній
   */
  async getCampaignHistory(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.campaignModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.campaignModel.countDocuments(),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Загальна аналітика
   */
  async getAnalytics() {
    const [
      totalCampaigns,
      totalSent,
      totalDelivered,
      totalFailed,
      byChannel,
    ] = await Promise.all([
      this.campaignModel.countDocuments(),
      this.campaignModel.aggregate([
        { $group: { _id: null, total: { $sum: '$sentCount' } } },
      ]),
      this.campaignModel.aggregate([
        { $group: { _id: null, total: { $sum: '$deliveredCount' } } },
      ]),
      this.campaignModel.aggregate([
        { $group: { _id: null, total: { $sum: '$failedCount' } } },
      ]),
      this.campaignModel.aggregate([
        { $group: { _id: '$channel', count: { $sum: 1 }, sent: { $sum: '$sentCount' } } },
      ]),
    ]);

    return {
      totalCampaigns,
      totalSent: totalSent[0]?.total || 0,
      totalDelivered: totalDelivered[0]?.total || 0,
      totalFailed: totalFailed[0]?.total || 0,
      byChannel,
    };
  }
}
