/**
 * History Quota Service
 * 
 * Управління лімітами history reports
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { UserHistoryQuota, UserHistoryQuotaDocument } from './schemas/user-history-quota.schema';
import { Model } from 'mongoose';

// Ліміти
const FREE_REPORTS_LIMIT = 2;
const COOLDOWN_HOURS = 1;

@Injectable()
export class HistoryQuotaService {
  private readonly logger = new Logger(HistoryQuotaService.name);

  constructor(
    @InjectModel(UserHistoryQuota.name)
    private readonly quotaModel: Model<UserHistoryQuotaDocument>,
  ) {}

  /**
   * Отримати або створити quota для user
   */
  async getOrCreate(userId: string): Promise<UserHistoryQuota> {
    let quota = await this.quotaModel.findOne({ userId });
    if (!quota) {
      quota = await this.quotaModel.create({ userId });
    }
    return quota;
  }

  /**
   * Чи може user використати безкоштовний report
   */
  async canUseFreeReport(userId: string): Promise<{
    canUse: boolean;
    reason?: string;
    freeRemaining: number;
  }> {
    const quota = await this.getOrCreate(userId);

    // Перевірка restriction
    if (quota.isRestricted) {
      return {
        canUse: false,
        reason: `Account restricted: ${quota.restrictionReason || 'abuse detected'}`,
        freeRemaining: 0,
      };
    }

    // Перевірка ліміту
    const freeRemaining = Math.max(0, FREE_REPORTS_LIMIT - quota.freeReportsUsed);
    if (quota.freeReportsUsed >= FREE_REPORTS_LIMIT) {
      return {
        canUse: false,
        reason: `Free quota exhausted (${FREE_REPORTS_LIMIT} reports used)`,
        freeRemaining: 0,
      };
    }

    // Перевірка cooldown
    if (quota.lastRequestAt) {
      const hoursSinceLastRequest = 
        (Date.now() - new Date(quota.lastRequestAt).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastRequest < COOLDOWN_HOURS) {
        const waitMinutes = Math.ceil((COOLDOWN_HOURS - hoursSinceLastRequest) * 60);
        return {
          canUse: false,
          reason: `Cooldown active. Please wait ${waitMinutes} minutes`,
          freeRemaining,
        };
      }
    }

    return { canUse: true, freeRemaining };
  }

  /**
   * Інкремент використаних безкоштовних reports
   */
  async incrementFree(userId: string): Promise<UserHistoryQuota | null> {
    const quota = await this.quotaModel.findOneAndUpdate(
      { userId },
      {
        $inc: { freeReportsUsed: 1 },
        $set: { lastRequestAt: new Date() },
      },
      { new: true, upsert: true },
    );

    this.logger.log(`[Quota] User ${userId} used free report (${quota?.freeReportsUsed}/${FREE_REPORTS_LIMIT})`);
    return quota;
  }

  /**
   * Обмежити користувача
   */
  async restrict(userId: string, reason: string): Promise<void> {
    await this.quotaModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          isRestricted: true,
          restrictedAt: new Date(),
          restrictionReason: reason,
        },
      },
      { upsert: true },
    );

    this.logger.warn(`[Quota] User ${userId} restricted: ${reason}`);
  }

  /**
   * Зняти обмеження
   */
  async unrestrict(userId: string): Promise<void> {
    await this.quotaModel.findOneAndUpdate(
      { userId },
      {
        $set: { isRestricted: false },
        $unset: { restrictedAt: 1, restrictionReason: 1 },
      },
    );
    this.logger.log(`[Quota] User ${userId} unrestricted`);
  }

  /**
   * Отримати quota користувача
   */
  async getQuota(userId: string): Promise<{
    freeReportsUsed: number;
    freeReportsLimit: number;
    freeRemaining: number;
    isRestricted: boolean;
    restrictionReason?: string;
    lastRequestAt?: Date;
  }> {
    const quota = await this.getOrCreate(userId);
    return {
      freeReportsUsed: quota.freeReportsUsed,
      freeReportsLimit: FREE_REPORTS_LIMIT,
      freeRemaining: Math.max(0, FREE_REPORTS_LIMIT - quota.freeReportsUsed),
      isRestricted: quota.isRestricted,
      restrictionReason: quota.restrictionReason,
      lastRequestAt: quota.lastRequestAt,
    };
  }

  /**
   * Admin: Всі quotas
   */
  async getAllQuotas(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.quotaModel.find().sort({ freeReportsUsed: -1 }).skip(skip).limit(limit).lean(),
      this.quotaModel.countDocuments(),
    ]);

    return { items, total, page, pages: Math.ceil(total / limit) };
  }
}
