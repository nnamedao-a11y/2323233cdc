/**
 * Deal Score Service
 * 
 * Combines profit and risk into overall deal score:
 * - strong_buy: score >= 70
 * - buy: score >= 50
 * - watch: score >= 30
 * - avoid: score < 30
 */

import { Injectable } from '@nestjs/common';

export interface ScoreInput {
  roi: number;
  netProfit: number;
  riskScore: number;
  intentScore?: number;
  marketDemand?: 'high' | 'medium' | 'low';
}

export interface ScoreResult {
  dealScore: number;
  decision: 'strong_buy' | 'buy' | 'watch' | 'avoid';
  breakdown: {
    profitScore: number;
    riskPenalty: number;
    intentBonus: number;
    demandBonus: number;
  };
}

@Injectable()
export class DealScoreService {
  calculate(input: ScoreInput): ScoreResult {
    let score = 0;
    let profitScore = 0;
    let riskPenalty = 0;
    let intentBonus = 0;
    let demandBonus = 0;

    // ROI scoring (0-30 points)
    if (input.roi > 20) {
      profitScore += 30;
    } else if (input.roi > 15) {
      profitScore += 25;
    } else if (input.roi > 10) {
      profitScore += 20;
    } else if (input.roi > 5) {
      profitScore += 12;
    } else if (input.roi > 0) {
      profitScore += 5;
    }

    // Net profit scoring (0-30 points)
    if (input.netProfit > 5000) {
      profitScore += 30;
    } else if (input.netProfit > 3000) {
      profitScore += 25;
    } else if (input.netProfit > 2000) {
      profitScore += 18;
    } else if (input.netProfit > 1000) {
      profitScore += 12;
    } else if (input.netProfit > 500) {
      profitScore += 6;
    } else if (input.netProfit > 0) {
      profitScore += 2;
    }

    // Risk penalty (0-30 points deduction)
    if (input.riskScore >= 60) {
      riskPenalty = -30;
    } else if (input.riskScore >= 40) {
      riskPenalty = -20;
    } else if (input.riskScore >= 25) {
      riskPenalty = -10;
    } else if (input.riskScore >= 10) {
      riskPenalty = -5;
    }

    // Intent bonus (0-20 points)
    if (input.intentScore) {
      intentBonus = Math.min(input.intentScore, 20);
    }

    // Market demand bonus (0-10 points)
    if (input.marketDemand === 'high') {
      demandBonus = 10;
    } else if (input.marketDemand === 'medium') {
      demandBonus = 5;
    }

    // Calculate total
    score = profitScore + riskPenalty + intentBonus + demandBonus;
    score = Math.max(0, Math.min(100, score));

    // Determine decision
    let decision: ScoreResult['decision'];
    if (score >= 70) {
      decision = 'strong_buy';
    } else if (score >= 50) {
      decision = 'buy';
    } else if (score >= 30) {
      decision = 'watch';
    } else {
      decision = 'avoid';
    }

    return {
      dealScore: score,
      decision,
      breakdown: {
        profitScore,
        riskPenalty,
        intentBonus,
        demandBonus,
      },
    };
  }
}
