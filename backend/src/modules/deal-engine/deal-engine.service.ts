/**
 * Deal Engine Service
 * 
 * Main service that orchestrates deal evaluation:
 * VIN → vehicle data → market estimate → bid/final price → risk → profit → recommendation
 */

import { Injectable, Logger } from '@nestjs/common';
import { DealProfitService, ProfitInput, ProfitResult } from './services/deal-profit.service';
import { DealRiskService, RiskInput, RiskResult } from './services/deal-risk.service';
import { DealScoreService, ScoreInput, ScoreResult } from './services/deal-score.service';
import { DealRecommendationService, RecommendationInput, RecommendationResult } from './services/deal-recommendation.service';

export interface DealEngineInput {
  // Required pricing
  marketPrice: number;
  maxBid: number;
  finalAllInPrice: number;
  breakEvenBid?: number;
  
  // Optional profit adjustments
  platformMargin?: number;
  repairEstimate?: number;
  
  // Risk factors
  confidence: number;
  saleDate?: string;
  damage?: string;
  sourceCount: number;
  year?: number;
  mileage?: number;
  isCleanTitle?: boolean;
  
  // Optional user intent
  intentScore?: number;
  marketDemand?: 'high' | 'medium' | 'low';
  
  // Vehicle info (for logging/context)
  vin?: string;
  make?: string;
  model?: string;
}

export interface DealEngineResult {
  vin?: string;
  vehicle?: {
    make?: string;
    model?: string;
    year?: number;
  };
  profit: ProfitResult;
  risk: RiskResult;
  score: ScoreResult;
  recommendation: RecommendationResult;
  evaluatedAt: string;
}

@Injectable()
export class DealEngineService {
  private readonly logger = new Logger(DealEngineService.name);

  constructor(
    private readonly profitService: DealProfitService,
    private readonly riskService: DealRiskService,
    private readonly scoreService: DealScoreService,
    private readonly recommendationService: DealRecommendationService,
  ) {}

  /**
   * Evaluate a deal and return full analysis
   */
  async evaluate(input: DealEngineInput): Promise<DealEngineResult> {
    this.logger.log(`[DealEngine] Evaluating deal: VIN=${input.vin || 'N/A'}, Market=$${input.marketPrice}, MaxBid=$${input.maxBid}`);

    // Calculate profit
    const profitInput: ProfitInput = {
      marketPrice: input.marketPrice,
      maxBid: input.maxBid,
      finalAllInPrice: input.finalAllInPrice,
      platformMargin: input.platformMargin,
      repairEstimate: input.repairEstimate,
    };
    const profit = this.profitService.calculate(profitInput);

    // Calculate risk
    const riskInput: RiskInput = {
      confidence: input.confidence,
      saleDate: input.saleDate,
      damage: input.damage,
      sourceCount: input.sourceCount,
      year: input.year,
      mileage: input.mileage,
      isCleanTitle: input.isCleanTitle,
    };
    const risk = this.riskService.calculate(riskInput);

    // Calculate overall score
    const scoreInput: ScoreInput = {
      roi: profit.roi,
      netProfit: profit.netProfit,
      riskScore: risk.riskScore,
      intentScore: input.intentScore,
      marketDemand: input.marketDemand,
    };
    const score = this.scoreService.calculate(scoreInput);

    // Generate recommendation
    const breakEvenBid = input.breakEvenBid || (input.marketPrice - (input.platformMargin || 0));
    const recommendationInput: RecommendationInput = {
      decision: score.decision,
      maxBid: input.maxBid,
      breakEvenBid,
      finalAllInPrice: input.finalAllInPrice,
      marketPrice: input.marketPrice,
      netProfit: profit.netProfit,
      riskLevel: risk.riskLevel,
      riskFactors: risk.factors,
    };
    const recommendation = this.recommendationService.build(recommendationInput);

    this.logger.log(`[DealEngine] Result: Decision=${score.decision}, Score=${score.dealScore}, Profit=$${profit.netProfit}, Risk=${risk.riskLevel}`);

    return {
      vin: input.vin,
      vehicle: {
        make: input.make,
        model: input.model,
        year: input.year,
      },
      profit,
      risk,
      score,
      recommendation,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Quick evaluation - just returns decision
   */
  quickEvaluate(input: DealEngineInput): { decision: string; score: number; netProfit: number } {
    const profit = this.profitService.calculate({
      marketPrice: input.marketPrice,
      maxBid: input.maxBid,
      finalAllInPrice: input.finalAllInPrice,
      platformMargin: input.platformMargin,
      repairEstimate: input.repairEstimate,
    });

    const risk = this.riskService.calculate({
      confidence: input.confidence,
      saleDate: input.saleDate,
      damage: input.damage,
      sourceCount: input.sourceCount,
    });

    const score = this.scoreService.calculate({
      roi: profit.roi,
      netProfit: profit.netProfit,
      riskScore: risk.riskScore,
      intentScore: input.intentScore,
    });

    return {
      decision: score.decision,
      score: score.dealScore,
      netProfit: profit.netProfit,
    };
  }
}
