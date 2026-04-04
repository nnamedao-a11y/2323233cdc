import { Injectable, Logger } from '@nestjs/common';
import { IntentScoringService, IntentLevel } from './intent-scoring.service';

/**
 * Price Context for dynamic pricing
 */
export interface PriceContext {
  basePrice: number;
  customerId?: string;
  demandHigh?: boolean;
  lowCompetition?: boolean;
  auctionSoon?: boolean;
  urgencyLevel?: number; // 1-10
}

/**
 * Dynamic Price Result
 */
export interface DynamicPriceResult {
  originalPrice: number;
  finalPrice: number;
  multiplier: number;
  adjustments: string[];
  margin: number;
}

/**
 * Dynamic Pricing Service
 * 
 * Adjusts prices based on user intent and market conditions
 */
@Injectable()
export class DynamicPricingService {
  private readonly logger = new Logger(DynamicPricingService.name);

  constructor(
    private readonly intentService: IntentScoringService,
  ) {}

  /**
   * Calculate dynamic price
   */
  async getDynamicPrice(context: PriceContext): Promise<DynamicPriceResult> {
    let multiplier = 1.0;
    const adjustments: string[] = [];

    // User intent adjustment
    if (context.customerId) {
      const intent = await this.intentService.getIntentScore(context.customerId);
      
      if (intent.level === IntentLevel.HOT) {
        multiplier += 0.07; // +7% for hot users (they will buy)
        adjustments.push('hot_user_premium');
      } else if (intent.level === IntentLevel.COLD) {
        multiplier -= 0.05; // -5% discount to attract cold users
        adjustments.push('cold_user_discount');
      }
    }

    // Demand-based adjustment
    if (context.demandHigh) {
      multiplier += 0.05;
      adjustments.push('high_demand');
    }

    // Low competition bonus
    if (context.lowCompetition) {
      multiplier += 0.03;
      adjustments.push('low_competition');
    }

    // Auction urgency
    if (context.auctionSoon) {
      multiplier += 0.03;
      adjustments.push('auction_urgency');
    }

    // Urgency level (1-10)
    if (context.urgencyLevel && context.urgencyLevel >= 8) {
      multiplier += 0.02;
      adjustments.push('high_urgency');
    }

    // Cap multiplier range (0.90 to 1.15)
    multiplier = Math.max(0.90, Math.min(1.15, multiplier));

    const finalPrice = Math.round(context.basePrice * multiplier);
    const margin = finalPrice - context.basePrice;

    return {
      originalPrice: context.basePrice,
      finalPrice,
      multiplier,
      adjustments,
      margin,
    };
  }

  /**
   * Get optimal margin for a deal based on intent
   */
  async getOptimalMargin(customerId: string): Promise<number> {
    const intent = await this.intentService.getIntentLevel(customerId);
    
    switch (intent) {
      case IntentLevel.HOT:
        return 1.15; // 15% margin - they will pay
      case IntentLevel.WARM:
        return 1.10; // 10% margin
      case IntentLevel.COLD:
      default:
        return 1.05; // 5% margin - need to compete
    }
  }

  /**
   * Calculate discount recommendation
   */
  async getDiscountRecommendation(
    customerId: string,
    currentPrice: number,
    hoursWithoutResponse: number,
  ): Promise<{ shouldDiscount: boolean; amount: number; reason: string }> {
    const intent = await this.intentService.getIntentScore(customerId);

    // Hot users - no discount
    if (intent.level === IntentLevel.HOT) {
      return { shouldDiscount: false, amount: 0, reason: 'User is hot - do not discount' };
    }

    // Warm users - small discount after 24h
    if (intent.level === IntentLevel.WARM && hoursWithoutResponse > 24) {
      return { 
        shouldDiscount: true, 
        amount: Math.min(500, currentPrice * 0.02), // 2% or $500 max
        reason: 'Warm user, no response 24h - offer small discount',
      };
    }

    // Cold users - bigger discount after 48h
    if (intent.level === IntentLevel.COLD && hoursWithoutResponse > 48) {
      return {
        shouldDiscount: true,
        amount: Math.min(1000, currentPrice * 0.05), // 5% or $1000 max
        reason: 'Cold user, no response 48h - offer discount',
      };
    }

    return { shouldDiscount: false, amount: 0, reason: 'No discount needed' };
  }
}
