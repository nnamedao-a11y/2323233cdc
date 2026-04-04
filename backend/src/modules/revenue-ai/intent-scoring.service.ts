import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * Intent Level - How hot is the user
 */
export enum IntentLevel {
  COLD = 'cold',     // 0-2 score
  WARM = 'warm',     // 3-5 score
  HOT = 'hot',       // 6+ score
}

/**
 * User Intent Score
 */
export interface UserIntentScore {
  customerId: string;
  score: number;
  level: IntentLevel;
  factors: {
    savedCars: number;
    recentViews: number;
    requestedQuotes: number;
    depositStarted: boolean;
    lastActivityDaysAgo: number;
  };
}

/**
 * Intent Scoring Service
 * 
 * Calculates user purchase intent based on behavior
 */
@Injectable()
export class IntentScoringService {
  private readonly logger = new Logger(IntentScoringService.name);

  constructor(
    @InjectModel('CustomerSavedListing') private savedModel: Model<any>,
    @InjectModel('CustomerRecentlyViewed') private viewedModel: Model<any>,
    @InjectModel('Quote') private quoteModel: Model<any>,
    @InjectModel('Deposit') private depositModel: Model<any>,
    @InjectModel('Customer') private customerModel: Model<any>,
  ) {}

  /**
   * Calculate user intent score
   */
  async getIntentScore(customerId: string): Promise<UserIntentScore> {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Gather all factors
    const [savedCount, recentViewCount, quoteCount, depositStarted, customer] = await Promise.all([
      // Saved cars (strong signal)
      this.savedModel.countDocuments({ customerId }).catch(() => 0),
      
      // Recent views (last 3 days)
      this.viewedModel.countDocuments({
        customerId,
        $or: [
          { viewedAt: { $gte: threeDaysAgo } },
          { createdAt: { $gte: threeDaysAgo } },
        ],
      }).catch(() => 0),
      
      // Quote requests (very strong signal)
      this.quoteModel.countDocuments({
        customerId,
        createdAt: { $gte: sevenDaysAgo },
      }).catch(() => 0),
      
      // Deposit started (strongest signal)
      this.depositModel.findOne({
        customerId,
        status: { $in: ['pending', 'waiting_confirmation'] },
      }).lean().catch(() => null),
      
      // Customer for last activity
      this.customerModel.findOne({ id: customerId }).lean().catch(() => null),
    ]);

    // Calculate score
    let score = 0;

    // Saved cars: +2 per car (max 6 points)
    score += Math.min(savedCount * 2, 6);

    // Recent views: +1 per view (max 4 points)
    score += Math.min(recentViewCount, 4);

    // Quote requests: +3 per quote (strongest)
    score += quoteCount * 3;

    // Deposit started: +5 (highest intent)
    if (depositStarted) {
      score += 5;
    }

    // Recent activity bonus
    const cust: any = customer;
    const lastActivity = cust?.lastInteractionAt || cust?.createdAt;
    let lastActivityDaysAgo = 999;
    if (lastActivity) {
      lastActivityDaysAgo = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
      if (lastActivityDaysAgo <= 1) score += 2;
      else if (lastActivityDaysAgo <= 3) score += 1;
    }

    // Determine level
    let level: IntentLevel;
    if (score >= 6) level = IntentLevel.HOT;
    else if (score >= 3) level = IntentLevel.WARM;
    else level = IntentLevel.COLD;

    return {
      customerId,
      score,
      level,
      factors: {
        savedCars: savedCount,
        recentViews: recentViewCount,
        requestedQuotes: quoteCount,
        depositStarted: !!depositStarted,
        lastActivityDaysAgo,
      },
    };
  }

  /**
   * Get intent level directly
   */
  async getIntentLevel(customerId: string): Promise<IntentLevel> {
    const intent = await this.getIntentScore(customerId);
    return intent.level;
  }

  /**
   * Check if user is hot
   */
  async isHotUser(customerId: string): Promise<boolean> {
    const intent = await this.getIntentScore(customerId);
    return intent.level === IntentLevel.HOT;
  }
}
