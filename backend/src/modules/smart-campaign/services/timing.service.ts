/**
 * Timing Service
 * 
 * Визначає КОЛИ писати:
 * - Робочі години (9:00 - 21:00)
 * - Cooldown (не частіше 1 раз / 6 год)
 * - Терміновість (auction < 24h → зараз)
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SmartCampaignLog, SmartCampaignLogDocument } from '../schemas/smart-campaign-log.schema';

export interface TimingDecision {
  shouldSend: boolean;
  reason: string;
  delayMinutes?: number;
  nextAllowedAt?: Date;
}

@Injectable()
export class TimingService {
  private readonly logger = new Logger(TimingService.name);

  // Cooldown в мілісекундах (6 годин)
  private readonly COOLDOWN_MS = 6 * 60 * 60 * 1000;

  // Робочі години
  private readonly WORKING_HOURS = { start: 9, end: 21 };

  constructor(
    @InjectModel(SmartCampaignLog.name)
    private readonly logModel: Model<SmartCampaignLogDocument>,
  ) {}

  /**
   * Перевірити чи можна відправити зараз
   */
  async canSendNow(userId: string, isUrgent = false): Promise<TimingDecision> {
    // 1. Перевірка робочих годин (крім термінових)
    if (!isUrgent && !this.isWithinWorkingHours()) {
      const nextStart = this.getNextWorkingHourStart();
      return {
        shouldSend: false,
        reason: 'outside_working_hours',
        nextAllowedAt: nextStart,
        delayMinutes: Math.ceil((nextStart.getTime() - Date.now()) / 60000),
      };
    }

    // 2. Перевірка cooldown
    const lastMessage = await this.logModel.findOne({
      userId,
      status: { $in: ['sent', 'delivered'] },
    }).sort({ sentAt: -1 });

    if (lastMessage?.sentAt) {
      const timeSince = Date.now() - lastMessage.sentAt.getTime();
      if (timeSince < this.COOLDOWN_MS) {
        const nextAllowed = new Date(lastMessage.sentAt.getTime() + this.COOLDOWN_MS);
        return {
          shouldSend: false,
          reason: 'cooldown_active',
          nextAllowedAt: nextAllowed,
          delayMinutes: Math.ceil((this.COOLDOWN_MS - timeSince) / 60000),
        };
      }
    }

    return {
      shouldSend: true,
      reason: 'ok',
    };
  }

  /**
   * Перевірка робочих годин
   */
  private isWithinWorkingHours(): boolean {
    const hour = new Date().getHours();
    return hour >= this.WORKING_HOURS.start && hour < this.WORKING_HOURS.end;
  }

  /**
   * Наступний початок робочого дня
   */
  private getNextWorkingHourStart(): Date {
    const now = new Date();
    const next = new Date(now);
    
    if (now.getHours() >= this.WORKING_HOURS.end) {
      // Наступний день
      next.setDate(next.getDate() + 1);
    }
    
    next.setHours(this.WORKING_HOURS.start, 0, 0, 0);
    return next;
  }

  /**
   * Визначити оптимальний час для відправки
   */
  async getOptimalSendTime(userId: string): Promise<Date> {
    const decision = await this.canSendNow(userId);
    
    if (decision.shouldSend) {
      return new Date();
    }

    return decision.nextAllowedAt || new Date();
  }

  /**
   * Чи є аукціон терміновим (< 24h)
   */
  isAuctionUrgent(auctionDate: Date): boolean {
    const hoursUntil = (auctionDate.getTime() - Date.now()) / (60 * 60 * 1000);
    return hoursUntil <= 24 && hoursUntil > 0;
  }

  /**
   * Статистика по часу відправки
   */
  async getTimingStats() {
    const stats = await this.logModel.aggregate([
      { $match: { status: 'delivered' } },
      {
        $group: {
          _id: { $hour: '$sentAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return stats;
  }
}
