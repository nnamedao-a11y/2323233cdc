/**
 * Revenue Learning Service
 * 
 * Аналіз історичних даних для покращення рекомендацій:
 * - Патерни успішних угод
 * - Оптимальні знижки по сегментах
 * - Data-backed advice
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RevenueOutcome, RevenueOutcomeDocument } from '../schemas/revenue-outcome.schema';
import { RevenuePattern, RevenuePatternDocument } from '../schemas/revenue-pattern.schema';

export interface LearnedRecommendation {
  discount: number;
  reason: 'historical_learning' | 'fallback_rules';
  expectedDealRate?: number;
  sampleSize?: number;
  confidence: number;
}

@Injectable()
export class RevenueLearningService {
  private readonly logger = new Logger(RevenueLearningService.name);

  constructor(
    @InjectModel(RevenueOutcome.name)
    private readonly outcomeModel: Model<RevenueOutcomeDocument>,
    @InjectModel(RevenuePattern.name)
    private readonly patternModel: Model<RevenuePatternDocument>,
  ) {}

  /**
   * Логування рекомендації
   */
  async logRecommendation(data: {
    leadId: string;
    userId: string;
    managerId?: string;
    vin?: string;
    marketPrice?: number;
    finalPrice?: number;
    maxBid?: number;
    netProfit?: number;
    intentScore?: number;
    intentLevel?: string;
    compareCount?: number;
    favoritesCount?: number;
    suggestedAction?: string;
    suggestedDiscount?: number;
    confidence?: number;
  }) {
    // Визначити buckets
    const intentBucket = (data.intentScore || 0) >= 10 ? 'hot' : (data.intentScore || 0) >= 5 ? 'warm' : 'cold';
    const compareBucket = (data.compareCount || 0) >= 2 ? 'compare' : 'single';
    const profitBucket = (data.netProfit || 0) > 1500 ? 'high' : (data.netProfit || 0) > 500 ? 'medium' : 'low';

    return this.outcomeModel.findOneAndUpdate(
      { leadId: data.leadId },
      {
        ...data,
        intentBucket,
        compareBucket,
        profitBucket,
        wasContacted: false,
        becameQualified: false,
        becameDeal: false,
        becameDeposit: false,
      },
      { upsert: true, new: true },
    );
  }

  /**
   * Оновити outcome (результат)
   */
  async updateOutcome(leadId: string, patch: Partial<{
    actionTaken: string;
    actualDiscount: number;
    wasContacted: boolean;
    becameQualified: boolean;
    becameDeal: boolean;
    becameDeposit: boolean;
    dealValue: number;
    depositValue: number;
  }>) {
    const now = new Date();
    const updates: any = { ...patch };

    if (patch.wasContacted) updates.contactedAt = now;
    if (patch.becameQualified) updates.qualifiedAt = now;
    if (patch.becameDeal) updates.dealAt = now;
    if (patch.becameDeposit) updates.depositAt = now;

    return this.outcomeModel.findOneAndUpdate(
      { leadId },
      { $set: updates },
      { new: true },
    );
  }

  /**
   * Отримати learned рекомендацію
   */
  async getBestDiscount(context: {
    intentScore: number;
    compareCount: number;
    netProfit: number;
  }): Promise<LearnedRecommendation> {
    const intentBucket = context.intentScore >= 10 ? 'hot' : context.intentScore >= 5 ? 'warm' : 'cold';
    const compareBucket = context.compareCount >= 2 ? 'compare' : 'single';
    const profitBucket = context.netProfit > 1500 ? 'high' : context.netProfit > 500 ? 'medium' : 'low';

    const patternKey = `${intentBucket}_${compareBucket}_${profitBucket}`;
    const pattern = await this.patternModel.findOne({ patternKey });

    if (pattern && pattern.sampleSize >= 10) {
      return {
        discount: pattern.bestDiscount,
        reason: 'historical_learning',
        expectedDealRate: pattern.dealRate,
        sampleSize: pattern.sampleSize,
        confidence: Math.min(90, 50 + pattern.sampleSize),
      };
    }

    // Fallback на базові правила
    const maxDiscount = Math.floor(context.netProfit * 0.3);
    let discount = 0;

    if (context.netProfit > 1500) discount = Math.min(300, maxDiscount);
    else if (context.netProfit > 1000) discount = Math.min(200, maxDiscount);
    else if (context.netProfit > 500) discount = Math.min(100, maxDiscount);

    return {
      discount,
      reason: 'fallback_rules',
      confidence: 40,
    };
  }

  /**
   * Перерахувати патерни (cron або manual)
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async recalculatePatterns() {
    this.logger.log('[RevenueLearning] Recalculating patterns...');

    const patterns = await this.outcomeModel.aggregate([
      { $match: { becameDeal: { $exists: true } } },
      {
        $group: {
          _id: {
            intentBucket: '$intentBucket',
            compareBucket: '$compareBucket',
            profitBucket: '$profitBucket',
            discount: '$actualDiscount',
          },
          total: { $sum: 1 },
          deals: { $sum: { $cond: ['$becameDeal', 1, 0] } },
          deposits: { $sum: { $cond: ['$becameDeposit', 1, 0] } },
          avgProfit: { $avg: '$netProfit' },
        },
      },
      { $match: { total: { $gte: 5 } } },
    ]);

    // Знайти найкращий discount для кожної комбінації buckets
    const bestByBucket = new Map<string, any>();

    for (const p of patterns) {
      const key = `${p._id.intentBucket}_${p._id.compareBucket}_${p._id.profitBucket}`;
      const dealRate = p.total > 0 ? p.deals / p.total : 0;

      const existing = bestByBucket.get(key);
      if (!existing || dealRate > existing.dealRate) {
        bestByBucket.set(key, {
          patternKey: key,
          intentBucket: p._id.intentBucket,
          compareBucket: p._id.compareBucket,
          profitBucket: p._id.profitBucket,
          bestDiscount: p._id.discount || 0,
          dealRate,
          depositRate: p.total > 0 ? p.deposits / p.total : 0,
          avgProfit: p.avgProfit,
          sampleSize: p.total,
        });
      }
    }

    // Зберегти патерни
    for (const [key, pattern] of bestByBucket.entries()) {
      await this.patternModel.findOneAndUpdate(
        { patternKey: key },
        { ...pattern, lastUpdatedAt: new Date() },
        { upsert: true },
      );
    }

    this.logger.log(`[RevenueLearning] Updated ${bestByBucket.size} patterns`);
  }

  /**
   * Отримати всі патерни
   */
  async getPatterns() {
    return this.patternModel.find().sort({ dealRate: -1 }).lean();
  }

  /**
   * Статистика learning
   */
  async getStats() {
    const [totalOutcomes, withDeals, withDeposits, patterns] = await Promise.all([
      this.outcomeModel.countDocuments(),
      this.outcomeModel.countDocuments({ becameDeal: true }),
      this.outcomeModel.countDocuments({ becameDeposit: true }),
      this.patternModel.countDocuments(),
    ]);

    return {
      totalOutcomes,
      withDeals,
      withDeposits,
      dealRate: totalOutcomes > 0 ? ((withDeals / totalOutcomes) * 100).toFixed(1) : 0,
      depositRate: totalOutcomes > 0 ? ((withDeposits / totalOutcomes) * 100).toFixed(1) : 0,
      patternsLearned: patterns,
    };
  }
}
