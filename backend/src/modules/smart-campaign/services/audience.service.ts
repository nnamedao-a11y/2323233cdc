/**
 * Audience Service
 * 
 * Визначає КОМУ писати:
 * - favorites (є інтерес)
 * - compare (вибирає)
 * - intent ≥ 5
 * - inactive users
 * - auction triggers
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Favorite, FavoriteDocument } from '../../user-engagement/favorites/schemas/favorite.schema';
import { CompareList, CompareListDocument } from '../../user-engagement/compare/schemas/compare-list.schema';
import { IntentScore, IntentScoreDocument, IntentLevel } from '../../reminder-workflow/schemas/intent-score.schema';

export interface AudienceUser {
  userId: string;
  intentScore: number;
  intentLevel: string;
  favoritesCount: number;
  comparesCount: number;
  lastActivityAt?: Date;
  name?: string;
  phone?: string;
  email?: string;
  telegramId?: string;
}

export interface AudienceFilter {
  vin?: string;
  minIntent?: number;
  onlyHot?: boolean;
  onlyInactive?: boolean;
  inactiveHours?: number;
}

@Injectable()
export class AudienceService {
  private readonly logger = new Logger(AudienceService.name);

  constructor(
    @InjectModel(Favorite.name)
    private readonly favoriteModel: Model<FavoriteDocument>,
    @InjectModel(CompareList.name)
    private readonly compareModel: Model<CompareListDocument>,
    @InjectModel(IntentScore.name)
    private readonly intentModel: Model<IntentScoreDocument>,
  ) {}

  /**
   * Знайти аудиторію по VIN
   */
  async buildByVin(vin: string, filter: AudienceFilter = {}): Promise<AudienceUser[]> {
    const userIds = new Set<string>();

    // Get users who favorited this VIN
    const favorites = await this.favoriteModel.find({ vin }).lean();
    favorites.forEach(f => userIds.add(f.userId));

    // Get users who compared this VIN
    const compares = await this.compareModel.find({ 'items.vin': vin }).lean();
    compares.forEach(c => userIds.add(c.userId));

    if (userIds.size === 0) return [];

    return this.enrichUsers(Array.from(userIds), filter);
  }

  /**
   * Знайти всіх HOT користувачів
   */
  async buildHotUsers(): Promise<AudienceUser[]> {
    const intents = await this.intentModel.find({ level: IntentLevel.HOT }).lean();
    return intents.map(this.mapIntentToUser);
  }

  /**
   * Знайти неактивних користувачів
   */
  async buildInactiveUsers(inactiveHours = 48): Promise<AudienceUser[]> {
    const cutoff = new Date(Date.now() - inactiveHours * 60 * 60 * 1000);
    
    const intents = await this.intentModel.find({
      score: { $gte: 3 }, // Мінімальний інтерес
      lastActivityAt: { $lt: cutoff },
    }).lean();

    return intents.map(this.mapIntentToUser);
  }

  /**
   * Знайти користувачів для конкретного тригера
   */
  async buildForTrigger(trigger: string, params: any = {}): Promise<AudienceUser[]> {
    switch (trigger) {
      case 'auction_soon':
        return this.buildByVin(params.vin, { minIntent: 3 });
      
      case 'price_drop':
        return this.buildByVin(params.vin, { minIntent: 2 });
      
      case 'hot_users':
        return this.buildHotUsers();
      
      case 'inactive':
        return this.buildInactiveUsers(params.inactiveHours || 48);
      
      default:
        return [];
    }
  }

  /**
   * Збагатити користувачів даними intent score
   */
  private async enrichUsers(userIds: string[], filter: AudienceFilter = {}): Promise<AudienceUser[]> {
    let query: any = { userId: { $in: userIds } };

    if (filter.minIntent) {
      query.score = { $gte: filter.minIntent };
    }

    if (filter.onlyHot) {
      query.level = IntentLevel.HOT;
    }

    if (filter.onlyInactive && filter.inactiveHours) {
      const cutoff = new Date(Date.now() - filter.inactiveHours * 60 * 60 * 1000);
      query.lastActivityAt = { $lt: cutoff };
    }

    const intents = await this.intentModel.find(query).lean();
    return intents.map(this.mapIntentToUser);
  }

  /**
   * Мапінг intent -> user
   */
  private mapIntentToUser = (intent: any): AudienceUser => ({
    userId: intent.userId,
    intentScore: intent.score,
    intentLevel: intent.level,
    favoritesCount: intent.favoritesCount || 0,
    comparesCount: intent.comparesCount || 0,
    lastActivityAt: intent.lastActivityAt,
    name: intent.context?.name,
    phone: intent.context?.phone,
    email: intent.context?.email,
    telegramId: intent.context?.telegramId,
  });

  /**
   * Отримати топ VIN що йдуть на аукціон скоро
   * (Заглушка - в реальності буде інтеграція з auction API)
   */
  async getUpcomingAuctionVins(hoursAhead = 24): Promise<string[]> {
    // Повертаємо VIN які мають найбільше favorites/compare
    const topFavorites = await this.favoriteModel.aggregate([
      { $group: { _id: '$vin', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    return topFavorites.map(f => f._id);
  }

  /**
   * Статистика аудиторії
   */
  async getAudienceStats() {
    const [totalUsers, hotUsers, warmUsers, coldUsers] = await Promise.all([
      this.intentModel.countDocuments(),
      this.intentModel.countDocuments({ level: IntentLevel.HOT }),
      this.intentModel.countDocuments({ level: IntentLevel.WARM }),
      this.intentModel.countDocuments({ level: IntentLevel.COLD }),
    ]);

    return { totalUsers, hotUsers, warmUsers, coldUsers };
  }
}
