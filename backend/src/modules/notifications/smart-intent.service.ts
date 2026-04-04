import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * Smart Intent Service
 * 
 * Calculates user intent score to determine notification priority
 * 
 * Intent Levels:
 * - HOT: High intent, send all notifications
 * - WARM: Medium intent, send important notifications
 * - COLD: Low intent, send only critical notifications
 */

export enum IntentLevel {
  HOT = 'HOT',
  WARM = 'WARM',
  COLD = 'COLD',
}

@Injectable()
export class SmartIntentService {
  private readonly logger = new Logger(SmartIntentService.name);

  constructor(
    @InjectModel('CustomerSavedListing')
    private readonly savedModel: Model<any>,
    @InjectModel('CustomerRecentlyViewed')
    private readonly viewedModel: Model<any>,
    @InjectModel('Lead')
    private readonly leadModel: Model<any>,
  ) {}

  /**
   * Calculate user intent score
   */
  async getUserIntentScore(customerId: string): Promise<number> {
    let score = 0;

    // Saved listings (high intent indicator)
    const savedCount = await this.savedModel.countDocuments({ customerId });
    score += savedCount * 3;

    // Recently viewed (medium intent indicator)
    const viewedCount = await this.viewedModel.countDocuments({ customerId });
    score += viewedCount * 1;

    // Recent activity bonus
    const lastViewed: any = await this.viewedModel
      .findOne({ customerId })
      .sort({ viewedAt: -1 })
      .lean();

    if (lastViewed?.viewedAt) {
      const hoursSinceActivity = (Date.now() - new Date(lastViewed.viewedAt as Date).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceActivity < 1) {
        score += 15; // Very recent activity
      } else if (hoursSinceActivity < 24) {
        score += 8; // Within last day
      } else if (hoursSinceActivity < 72) {
        score += 3; // Within 3 days
      }
    }

    // Has active leads (high intent)
    const activeLeads = await this.leadModel.countDocuments({
      customerId,
      status: { $in: ['new', 'contacted', 'qualified'] },
    });
    score += activeLeads * 5;

    return score;
  }

  /**
   * Classify user intent level
   */
  classify(score: number): IntentLevel {
    if (score >= 25) return IntentLevel.HOT;
    if (score >= 10) return IntentLevel.WARM;
    return IntentLevel.COLD;
  }

  /**
   * Get user intent level
   */
  async getUserIntentLevel(customerId: string): Promise<IntentLevel> {
    const score = await this.getUserIntentScore(customerId);
    return this.classify(score);
  }

  /**
   * Check if notification should be sent based on intent and priority
   */
  shouldSendNotification(intentLevel: IntentLevel, priority: number): boolean {
    switch (intentLevel) {
      case IntentLevel.HOT:
        return true; // Send all notifications
      case IntentLevel.WARM:
        return priority >= 6; // Send medium+ priority
      case IntentLevel.COLD:
        return priority >= 8; // Send only high priority
      default:
        return false;
    }
  }
}
