import { Injectable, Logger } from '@nestjs/common';
import { IntentScoringService, IntentLevel, UserIntentScore } from './intent-scoring.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * Manager Advice Type
 */
export interface ManagerAdvice {
  action: 'close_now' | 'offer_discount' | 'send_recommendations' | 'follow_up' | 'wait';
  message: string;
  priority: 'high' | 'medium' | 'low';
  discount?: number;
  urgency?: string;
}

/**
 * Deal Analysis
 */
export interface DealAnalysis {
  dealId: string;
  customerId: string;
  intent: UserIntentScore;
  advice: ManagerAdvice;
  metrics: {
    daysInPipeline: number;
    lastContactDaysAgo: number;
    auctionHoursLeft?: number;
  };
}

/**
 * Manager AI Assist Service
 * 
 * Provides AI-powered advice to managers on how to handle deals
 */
@Injectable()
export class ManagerAiAssistService {
  private readonly logger = new Logger(ManagerAiAssistService.name);

  constructor(
    private readonly intentService: IntentScoringService,
    @InjectModel('Deal') private dealModel: Model<any>,
  ) {}

  /**
   * Get advice for a specific deal
   */
  async getDealAdvice(dealId: string): Promise<DealAnalysis | null> {
    const deal: any = await this.dealModel.findOne({
      $or: [{ id: dealId }, { _id: dealId }],
      isDeleted: false,
    }).lean();

    if (!deal || !deal.customerId) {
      return null;
    }

    const customerId = deal.customerId;
    const intent = await this.intentService.getIntentScore(customerId);
    
    // Calculate metrics
    const now = new Date();
    const daysInPipeline = Math.floor((now.getTime() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const lastContactDaysAgo = deal.lastContactAt 
      ? Math.floor((now.getTime() - new Date(deal.lastContactAt).getTime()) / (1000 * 60 * 60 * 24))
      : daysInPipeline;

    // Calculate auction hours left if applicable
    let auctionHoursLeft: number | undefined;
    // This would be fetched from the associated listing
    
    // Generate advice based on intent and deal state
    const advice = this.generateAdvice(intent, deal, { daysInPipeline, lastContactDaysAgo, auctionHoursLeft });

    return {
      dealId: deal.id || String(deal._id),
      customerId,
      intent,
      advice,
      metrics: {
        daysInPipeline,
        lastContactDaysAgo,
        auctionHoursLeft,
      },
    };
  }

  /**
   * Get batch advice for all active deals of a manager
   */
  async getManagerDashboard(managerId: string): Promise<DealAnalysis[]> {
    const deals = await this.dealModel.find({
      $or: [{ managerId }, { assignedTo: managerId }],
      isDeleted: false,
      status: { $nin: ['completed', 'cancelled'] },
    }).lean();

    const analyses: DealAnalysis[] = [];
    
    for (const deal of deals) {
      const analysis = await this.getDealAdvice(String(deal._id));
      if (analysis) {
        analyses.push(analysis);
      }
    }

    // Sort by priority
    return analyses.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.advice.priority] - priorityOrder[b.advice.priority];
    });
  }

  /**
   * Generate advice based on intent and deal state
   */
  private generateAdvice(
    intent: UserIntentScore,
    deal: any,
    metrics: { daysInPipeline: number; lastContactDaysAgo: number; auctionHoursLeft?: number },
  ): ManagerAdvice {
    
    // HOT USER - Close immediately
    if (intent.level === IntentLevel.HOT) {
      // If auction is soon - urgent
      if (metrics.auctionHoursLeft && metrics.auctionHoursLeft < 24) {
        return {
          action: 'close_now',
          message: `URGENT: Close now. Auction in ${metrics.auctionHoursLeft} hours. User is ready to buy. Do NOT discount.`,
          priority: 'high',
          urgency: 'immediate',
        };
      }
      
      // If waiting for deposit
      if (deal.status === 'waiting_deposit') {
        return {
          action: 'follow_up',
          message: 'Call now to confirm deposit. User is hot - push for payment.',
          priority: 'high',
          urgency: 'today',
        };
      }

      return {
        action: 'close_now',
        message: 'Close deal now. User is ready. Do NOT offer discount.',
        priority: 'high',
      };
    }

    // WARM USER - Gentle push
    if (intent.level === IntentLevel.WARM) {
      // No contact for 24+ hours
      if (metrics.lastContactDaysAgo >= 1) {
        return {
          action: 'offer_discount',
          message: `User is warm but cooling. Offer small discount ($300-500) to close.`,
          priority: 'medium',
          discount: 400,
        };
      }

      // In pipeline too long
      if (metrics.daysInPipeline > 7) {
        return {
          action: 'follow_up',
          message: 'Deal is stalling. Follow up with new options or urgency.',
          priority: 'medium',
        };
      }

      return {
        action: 'wait',
        message: 'User is engaged. Monitor and follow up if no action in 24h.',
        priority: 'low',
      };
    }

    // COLD USER - Re-engage
    if (intent.level === IntentLevel.COLD) {
      // Not worth heavy pursuit if cold
      if (metrics.daysInPipeline > 14) {
        return {
          action: 'send_recommendations',
          message: 'User is cold. Send new recommendations to re-engage.',
          priority: 'low',
        };
      }

      // Try discount to warm up
      if (metrics.lastContactDaysAgo >= 2) {
        return {
          action: 'offer_discount',
          message: 'User is cold. Offer meaningful discount ($800-1000) to re-engage.',
          priority: 'medium',
          discount: 800,
        };
      }

      return {
        action: 'send_recommendations',
        message: 'Send similar cars at lower prices to re-engage.',
        priority: 'low',
      };
    }

    return {
      action: 'wait',
      message: 'Monitor deal and follow up as needed.',
      priority: 'low',
    };
  }

  /**
   * Get urgency message for deal
   */
  async getUrgencyMessage(dealId: string, auctionHoursLeft: number): Promise<string | null> {
    const analysis = await this.getDealAdvice(dealId);
    
    if (!analysis) return null;

    const intent = analysis.intent;
    
    // Only send urgency to hot/warm users
    if (intent.level === IntentLevel.COLD) return null;

    if (auctionHoursLeft <= 2) {
      return `LAST CHANCE!\n\nAuction ends in ${auctionHoursLeft} hours.\n\nSecure your car NOW before it's gone.`;
    }

    if (auctionHoursLeft <= 6) {
      return `Auction in ${auctionHoursLeft} hours\n\nDon't miss this opportunity.\n\nContact us now to secure your car.`;
    }

    if (auctionHoursLeft <= 24) {
      return `Reminder: Auction tomorrow\n\nYour car goes to auction in ${auctionHoursLeft} hours.\n\nReady to proceed?`;
    }

    return null;
  }
}
