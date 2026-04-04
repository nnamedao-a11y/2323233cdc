/**
 * Favorites Service
 * 
 * Управління улюбленими авто
 * + Intent Scoring integration
 */

import { Injectable, NotFoundException, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Favorite, FavoriteDocument } from './schemas/favorite.schema';
import { Model } from 'mongoose';
import { AddFavoriteDto } from './dto/add-favorite.dto';
import { IntentScoringService } from '../../reminder-workflow/intent-scoring.service';

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    @InjectModel(Favorite.name)
    private readonly favoriteModel: Model<FavoriteDocument>,
    @Optional() @Inject(forwardRef(() => IntentScoringService))
    private readonly intentService?: IntentScoringService,
  ) {}

  /**
   * Додати авто в улюблені
   */
  async add(userId: string, dto: AddFavoriteDto) {
    const vin = dto.vin.trim().toUpperCase();
    
    // Check if already exists
    const existing = await this.favoriteModel.findOne({ userId, vehicleId: dto.vehicleId });
    
    const result = await this.favoriteModel.findOneAndUpdate(
      { userId, vehicleId: dto.vehicleId },
      {
        $set: {
          userId,
          vehicleId: dto.vehicleId,
          vin,
          sourcePage: dto.sourcePage,
          metadataSnapshot: dto.metadataSnapshot || {},
        },
      },
      { upsert: true, new: true },
    );

    // Update intent score only if new favorite
    if (!existing && this.intentService) {
      await this.intentService.onFavoriteAdded(userId);
    }

    this.logger.log(`[Favorites] User ${userId} added ${vin} to favorites`);
    return result;
  }

  /**
   * Видалити з улюблених
   */
  async remove(userId: string, vehicleId: string) {
    const deleted = await this.favoriteModel.findOneAndDelete({ userId, vehicleId });
    if (!deleted) throw new NotFoundException('Favorite not found');
    
    this.logger.log(`[Favorites] User ${userId} removed ${vehicleId} from favorites`);
    return { success: true };
  }

  /**
   * Отримати мої улюблені
   */
  async getMine(userId: string) {
    return this.favoriteModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Перевірити чи є в улюблених
   */
  async isFavorite(userId: string, vehicleId: string): Promise<boolean> {
    const count = await this.favoriteModel.countDocuments({ userId, vehicleId });
    return count > 0;
  }

  /**
   * Кількість улюблених користувача
   */
  async countByUser(userId: string): Promise<number> {
    return this.favoriteModel.countDocuments({ userId });
  }

  /**
   * Admin: Аналітика улюблених
   */
  async getAdminAnalytics() {
    // Топ авто по кількості favorites
    const topVehicles = await this.favoriteModel.aggregate([
      {
        $group: {
          _id: '$vin',
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
          lastAdded: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 50 },
      {
        $project: {
          vin: '$_id',
          count: 1,
          uniqueUsers: { $size: '$users' },
          lastAdded: 1,
          _id: 0,
        },
      },
    ]);

    // Топ користувачів по кількості favorites
    const topUsers = await this.favoriteModel.aggregate([
      {
        $group: {
          _id: '$userId',
          favoritesCount: { $sum: 1 },
          lastActivity: { $max: '$createdAt' },
        },
      },
      { $sort: { favoritesCount: -1 } },
      { $limit: 50 },
      {
        $project: {
          userId: '$_id',
          favoritesCount: 1,
          lastActivity: 1,
          _id: 0,
        },
      },
    ]);

    // Загальна статистика
    const totalFavorites = await this.favoriteModel.countDocuments();
    const uniqueUsers = await this.favoriteModel.distinct('userId');
    const uniqueVins = await this.favoriteModel.distinct('vin');

    // Favorites за останні 24h
    const last24h = await this.favoriteModel.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    return {
      topVehicles,
      topUsers,
      stats: {
        totalFavorites,
        uniqueUsers: uniqueUsers.length,
        uniqueVins: uniqueVins.length,
        last24h,
      },
    };
  }

  /**
   * Admin: Всі favorites
   */
  async getAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.favoriteModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.favoriteModel.countDocuments(),
    ]);

    return {
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
}
