/**
 * Compare Service
 * 
 * Управління списком порівняння (max 3 авто)
 * + Intent Scoring integration
 */

import { Injectable, BadRequestException, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CompareList, CompareListDocument, CompareItem } from './schemas/compare-list.schema';
import { Model } from 'mongoose';
import { AddCompareItemDto } from './dto/add-compare-item.dto';
import { IntentScoringService } from '../../reminder-workflow/intent-scoring.service';

const MAX_COMPARE_ITEMS = 3;

@Injectable()
export class CompareService {
  private readonly logger = new Logger(CompareService.name);

  constructor(
    @InjectModel(CompareList.name)
    private readonly compareModel: Model<CompareListDocument>,
    @Optional() @Inject(forwardRef(() => IntentScoringService))
    private readonly intentService?: IntentScoringService,
  ) {}

  /**
   * Додати авто до порівняння
   */
  async add(userId: string, dto: AddCompareItemDto) {
    const vin = dto.vin.trim().toUpperCase();
    let list = await this.compareModel.findOne({ userId });
    let isNew = false;

    if (!list) {
      list = await this.compareModel.create({
        userId,
        items: [{ vehicleId: dto.vehicleId, vin, snapshot: dto.snapshot || {} }],
      });
      isNew = true;
      this.logger.log(`[Compare] User ${userId} created compare list with ${vin}`);
    } else {
      // Перевірка на дублікат
      const already = list.items.some((x) => x.vehicleId === dto.vehicleId);
      if (already) {
        return list;
      }

      // Ліміт 3 авто
      if (list.items.length >= MAX_COMPARE_ITEMS) {
        throw new BadRequestException(`Compare list limit is ${MAX_COMPARE_ITEMS}`);
      }

      list.items.push({
        vehicleId: dto.vehicleId,
        vin,
        addedAt: new Date(),
        snapshot: dto.snapshot || {},
      } as CompareItem);

      await list.save();
      isNew = true;
      this.logger.log(`[Compare] User ${userId} added ${vin} to compare`);
    }

    // Update intent score
    if (isNew && this.intentService) {
      await this.intentService.onCompareAdded(userId);
    }

    return list;
  }

  /**
   * Видалити з порівняння
   */
  async remove(userId: string, vehicleId: string) {
    const list = await this.compareModel.findOne({ userId });
    if (!list) return { success: true };

    list.items = list.items.filter((x) => x.vehicleId !== vehicleId);
    await list.save();

    this.logger.log(`[Compare] User ${userId} removed ${vehicleId} from compare`);
    return { success: true };
  }

  /**
   * Очистити список порівняння
   */
  async clear(userId: string) {
    await this.compareModel.findOneAndUpdate(
      { userId },
      { $set: { items: [] } },
    );
    return { success: true };
  }

  /**
   * Отримати мій список порівняння
   */
  async mine(userId: string) {
    const list = await this.compareModel.findOne({ userId }).lean();
    return list || { userId, items: [] };
  }

  /**
   * Вирішити порівняння - отримати нормалізовану таблицю
   */
  async resolve(
    userId: string,
    vehiclesResolver: (vehicleIds: string[]) => Promise<any[]>,
  ) {
    const list = await this.compareModel.findOne({ userId }).lean();
    if (!list?.items?.length) return { items: [], comparison: [] };

    const vehicleIds = list.items.map((x) => x.vehicleId);
    const vehicles = await vehiclesResolver(vehicleIds);

    // Нормалізована таблиця порівняння
    const comparison = vehicles.map((v) => ({
      vehicleId: v._id?.toString() || v.vehicleId,
      vin: v.vin,
      title: v.title || `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(),
      year: v.year,
      make: v.make,
      model: v.model,
      auctionStatus: v.status || v.auctionStatus,
      saleDate: v.saleDate,
      price: v.price || v.currentBid || v.lastKnownPrice,
      marketPrice: v.marketPrice || v.marketEstimate,
      maxBid: v.maxBid || v.recommendedMaxBid,
      breakEvenBid: v.breakEvenBid,
      finalAllInPrice: v.finalAllInPrice,
      damage: v.damage || v.damageType || v.primaryDamage,
      mileage: v.mileage || v.odometer,
      location: v.location,
      confidence: v.confidence,
      dealStatus: v.dealStatus,
    }));

    return {
      items: list.items,
      comparison,
      comparedAt: new Date(),
    };
  }

  /**
   * Admin: Аналітика порівнянь
   */
  async getAdminAnalytics() {
    // Топ VIN-и що порівнюють
    const topComparedVins = await this.compareModel.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.vin',
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 50 },
      {
        $project: {
          vin: '$_id',
          count: 1,
          uniqueUsers: { $size: '$users' },
          _id: 0,
        },
      },
    ]);

    // Користувачі з активними порівняннями
    const activeComparers = await this.compareModel.aggregate([
      { $match: { 'items.0': { $exists: true } } },
      {
        $project: {
          userId: 1,
          itemsCount: { $size: '$items' },
          updatedAt: 1,
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: 50 },
    ]);

    // Статистика
    const totalLists = await this.compareModel.countDocuments();
    const activeLists = await this.compareModel.countDocuments({
      'items.0': { $exists: true },
    });

    return {
      topComparedVins,
      activeComparers,
      stats: {
        totalLists,
        activeLists,
        emptyLists: totalLists - activeLists,
      },
    };
  }
}
