/**
 * Deal Profit Service
 * 
 * Calculates profit metrics for a deal:
 * - Gross spread (market - all-in price)
 * - Net profit (after repairs)
 * - ROI percentage
 */

import { Injectable } from '@nestjs/common';

export interface ProfitInput {
  marketPrice: number;
  maxBid: number;
  finalAllInPrice: number;
  platformMargin?: number;
  repairEstimate?: number;
}

export interface ProfitResult {
  grossSpread: number;
  netProfit: number;
  roi: number;
  margins: {
    grossMargin: number;
    netMargin: number;
  };
}

@Injectable()
export class DealProfitService {
  calculate(input: ProfitInput): ProfitResult {
    const repair = input.repairEstimate || 0;
    const margin = input.platformMargin || 0;
    
    const grossSpread = input.marketPrice - input.finalAllInPrice;
    const netProfit = grossSpread + margin - repair;
    
    const roi = input.finalAllInPrice > 0
      ? Math.round((netProfit / input.finalAllInPrice) * 10000) / 100
      : 0;
    
    const grossMargin = input.marketPrice > 0
      ? Math.round((grossSpread / input.marketPrice) * 10000) / 100
      : 0;
    
    const netMargin = input.marketPrice > 0
      ? Math.round((netProfit / input.marketPrice) * 10000) / 100
      : 0;

    return {
      grossSpread,
      netProfit,
      roi,
      margins: {
        grossMargin,
        netMargin,
      },
    };
  }
}
