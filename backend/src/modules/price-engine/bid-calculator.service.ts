/**
 * Bid Calculator Service
 * 
 * Розрахунок:
 * - Max Bid (з profit margin)
 * - Break-even Bid (нуль маржі)
 * - Safe Bid (з буфером)
 * - Deal Status (GOOD/RISKY/BAD)
 */

import { Injectable, Logger } from '@nestjs/common';
import { CostCalculatorService, CostBreakdown, CostConfig } from './cost-calculator.service';
import { MarketEstimatorService, MarketEstimate, VehicleData } from './market-estimator.service';

export type DealStatus = 'GOOD_DEAL' | 'OK_DEAL' | 'RISKY' | 'OVERPRICED' | 'BAD_DEAL';

export interface BidRecommendation {
  maxBid: number;          // Maximum profitable bid
  safeBid: number;         // Max bid with safety buffer
  breakEvenBid: number;    // Zero profit bid
  riskBid: number;         // Where it starts being risky
  
  // At current bid
  currentBid?: number;
  profit?: number;
  margin?: number;
  dealStatus?: DealStatus;
  
  // Price components
  finalPrice: number;      // All-in price for customer
  platformMargin: number;  // Platform profit
  
  // Breakdown
  marketPrice: number;
  totalCosts: number;
  costsWithoutBid: number;
  targetMarginPercent: number;
}

export interface BidCalculationInput {
  vehicle: VehicleData;
  marketEstimate: MarketEstimate;
  costConfig?: Partial<CostConfig>;
  currentBid?: number;
  targetMarginPercent?: number;
}

@Injectable()
export class BidCalculatorService {
  private readonly logger = new Logger(BidCalculatorService.name);

  // Default target margin
  private readonly DEFAULT_MARGIN_PERCENT = 0.12; // 12%
  private readonly SAFE_BUFFER = 0.90; // 10% safety buffer

  constructor(
    private readonly costCalculator: CostCalculatorService,
  ) {}

  /**
   * Calculate bid recommendations
   */
  calculate(input: BidCalculationInput): BidRecommendation {
    const { vehicle, marketEstimate, currentBid } = input;
    const targetMarginPercent = input.targetMarginPercent || this.DEFAULT_MARGIN_PERCENT;
    
    this.logger.debug(
      `[BidCalculator] Calculating for ${vehicle.make} ${vehicle.model}, ` +
      `market: $${marketEstimate.estimatedPrice}`
    );

    const marketPrice = marketEstimate.estimatedPrice;

    // 1. Calculate costs without bid (fixed costs)
    const fixedCostConfig: Omit<CostConfig, 'bidPrice'> = {
      vehicleYear: vehicle.year,
      damage: vehicle.damage,
      location: undefined,
      engineVolume: 2.0,
      fuelType: 'gasoline',
    };
    const costsWithoutBid = this.costCalculator.calculateWithoutBid(fixedCostConfig);

    // 2. Calculate target margin
    const targetMargin = Math.round(marketPrice * targetMarginPercent);

    // 3. Calculate max bid
    // maxBid = marketPrice - fixedCosts - targetMargin
    const maxBid = Math.max(0, marketPrice - costsWithoutBid - targetMargin);

    // 4. Calculate break-even bid
    // breakEven = marketPrice - fixedCosts
    const breakEvenBid = Math.max(0, marketPrice - costsWithoutBid);

    // 5. Calculate safe bid (with buffer)
    const safeBid = Math.round(maxBid * this.SAFE_BUFFER);

    // 6. Risk bid (above this = risky)
    const riskBid = Math.round((maxBid + breakEvenBid) / 2);

    // 7. Calculate final price at max bid
    const costsAtMaxBid = this.costCalculator.calculate({
      ...fixedCostConfig,
      bidPrice: maxBid,
    });
    const finalPrice = costsAtMaxBid.totalCosts;

    // 8. Platform margin at max bid
    const platformMargin = marketPrice - finalPrice;

    // Build result
    const result: BidRecommendation = {
      maxBid: Math.round(maxBid),
      safeBid: Math.round(safeBid),
      breakEvenBid: Math.round(breakEvenBid),
      riskBid: Math.round(riskBid),
      finalPrice: Math.round(finalPrice),
      platformMargin: Math.round(platformMargin),
      marketPrice,
      totalCosts: Math.round(costsAtMaxBid.totalCosts - maxBid),
      costsWithoutBid: Math.round(costsWithoutBid),
      targetMarginPercent,
    };

    // 9. If current bid provided, calculate deal status
    if (currentBid !== undefined) {
      result.currentBid = currentBid;
      
      const costsAtCurrentBid = this.costCalculator.calculate({
        ...fixedCostConfig,
        bidPrice: currentBid,
      });
      
      result.profit = Math.round(marketPrice - costsAtCurrentBid.totalCosts);
      result.margin = Number((result.profit / marketPrice).toFixed(3));
      result.dealStatus = this.getDealStatus(currentBid, maxBid, breakEvenBid, riskBid);
    }

    return result;
  }

  /**
   * Determine deal status based on bid
   */
  getDealStatus(bid: number, maxBid: number, breakEven: number, riskBid: number): DealStatus {
    if (bid <= maxBid * 0.85) return 'GOOD_DEAL';
    if (bid <= maxBid) return 'OK_DEAL';
    if (bid <= riskBid) return 'RISKY';
    if (bid <= breakEven) return 'OVERPRICED';
    return 'BAD_DEAL';
  }

  /**
   * Get deal status color
   */
  getDealStatusColor(status: DealStatus): string {
    switch (status) {
      case 'GOOD_DEAL': return '#22c55e'; // green
      case 'OK_DEAL': return '#84cc16'; // lime
      case 'RISKY': return '#eab308'; // yellow
      case 'OVERPRICED': return '#f97316'; // orange
      case 'BAD_DEAL': return '#ef4444'; // red
    }
  }

  /**
   * Get deal status label
   */
  getDealStatusLabel(status: DealStatus): string {
    switch (status) {
      case 'GOOD_DEAL': return '🟢 ВИГІДНА УГОДА';
      case 'OK_DEAL': return '🟢 НОРМАЛЬНА УГОДА';
      case 'RISKY': return '🟡 РИЗИКОВАНА';
      case 'OVERPRICED': return '🟠 ЗАВИЩЕНА ЦІНА';
      case 'BAD_DEAL': return '🔴 НЕ ВИГІДНО';
    }
  }
}
