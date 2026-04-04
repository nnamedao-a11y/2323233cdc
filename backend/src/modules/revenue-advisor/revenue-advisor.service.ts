/**
 * Revenue Advisor Service
 * 
 * Головний сервіс - комбінує rules + learning + explain
 */

import { Injectable, Logger } from '@nestjs/common';
import { RevenueRulesService, RuleInput, RuleDecision } from './services/revenue-rules.service';
import { RevenueExplainService, Explanation } from './services/revenue-explain.service';
import { RevenueLearningService, LearnedRecommendation } from './services/revenue-learning.service';

export interface AdvisorInput {
  // Lead/User info
  leadId?: string;
  userId: string;
  managerId?: string;
  vin?: string;

  // Pricing
  marketPrice: number;
  finalPrice: number;
  netProfit: number;
  maxBid?: number;

  // User behavior
  intentScore: number;
  intentLevel?: string;
  compareCount: number;
  favoritesCount: number;
  lastActivityHours?: number;
}

export interface AdvisorRecommendation {
  action: string;
  discount: number;
  maxAllowedDiscount: number;
  confidence: number;
  source: 'rules' | 'learning' | 'combined';
  
  // Explanations
  summary: string;
  reasons: string[];
  details: string[];
  recommendation: string;
  aiExplanation?: string;

  // Learning data
  expectedDealRate?: number;
  sampleSize?: number;
}

@Injectable()
export class RevenueAdvisorService {
  private readonly logger = new Logger(RevenueAdvisorService.name);

  constructor(
    private readonly rulesService: RevenueRulesService,
    private readonly explainService: RevenueExplainService,
    private readonly learningService: RevenueLearningService,
  ) {}

  /**
   * Отримати рекомендацію
   */
  async getAdvice(input: AdvisorInput): Promise<AdvisorRecommendation> {
    const ruleInput: RuleInput = {
      intentScore: input.intentScore,
      intentLevel: input.intentLevel || (input.intentScore >= 10 ? 'hot' : input.intentScore >= 5 ? 'warm' : 'cold'),
      compareCount: input.compareCount,
      favoritesCount: input.favoritesCount,
      lastActivityHours: input.lastActivityHours,
      marketPrice: input.marketPrice,
      finalPrice: input.finalPrice,
      netProfit: input.netProfit,
      maxBid: input.maxBid,
    };

    // 1. Rule-based рекомендація
    const ruleDecision = this.rulesService.evaluate(ruleInput);

    // 2. Learning-based рекомендація
    const learnedDecision = await this.learningService.getBestDiscount({
      intentScore: input.intentScore,
      compareCount: input.compareCount,
      netProfit: input.netProfit,
    });

    // 3. Комбінування
    const finalDecision = this.combineDecisions(ruleDecision, learnedDecision, input.netProfit);

    // 4. Генерація пояснень
    const explanation = await this.explainService.explain(ruleInput, {
      ...ruleDecision,
      discount: finalDecision.discount,
      confidence: finalDecision.confidence,
    });

    // 5. Логування для learning (якщо є leadId)
    if (input.leadId) {
      await this.learningService.logRecommendation({
        leadId: input.leadId,
        userId: input.userId,
        managerId: input.managerId,
        vin: input.vin,
        marketPrice: input.marketPrice,
        finalPrice: input.finalPrice,
        maxBid: input.maxBid,
        netProfit: input.netProfit,
        intentScore: input.intentScore,
        intentLevel: ruleInput.intentLevel,
        compareCount: input.compareCount,
        favoritesCount: input.favoritesCount,
        suggestedAction: ruleDecision.action,
        suggestedDiscount: finalDecision.discount,
        confidence: finalDecision.confidence,
      });
    }

    return {
      action: ruleDecision.action,
      discount: finalDecision.discount,
      maxAllowedDiscount: ruleDecision.maxAllowedDiscount,
      confidence: finalDecision.confidence,
      source: finalDecision.source,
      summary: explanation.summary,
      reasons: ruleDecision.reasons,
      details: explanation.details,
      recommendation: explanation.recommendation,
      aiExplanation: explanation.aiExplanation,
      expectedDealRate: learnedDecision.expectedDealRate,
      sampleSize: learnedDecision.sampleSize,
    };
  }

  /**
   * Комбінування rule-based та learned рекомендацій
   */
  private combineDecisions(
    rules: RuleDecision,
    learned: LearnedRecommendation,
    netProfit: number
  ): { discount: number; confidence: number; source: 'rules' | 'learning' | 'combined' } {
    // Якщо є достатньо даних для learning
    if (learned.reason === 'historical_learning' && learned.sampleSize && learned.sampleSize >= 10) {
      // Перевірка що learned discount не перевищує бізнес-обмеження
      const maxAllowed = Math.floor(netProfit * 0.3);
      const safeDiscount = Math.min(learned.discount, maxAllowed);

      // Якщо learned має кращий deal rate, використовуємо його
      if (learned.expectedDealRate && learned.expectedDealRate > 0.15) {
        return {
          discount: safeDiscount,
          confidence: learned.confidence,
          source: 'learning',
        };
      }
    }

    // Fallback на rules
    return {
      discount: rules.discount,
      confidence: rules.confidence,
      source: 'rules',
    };
  }

  /**
   * Записати результат (outcome)
   */
  async recordOutcome(leadId: string, outcome: {
    actionTaken?: string;
    actualDiscount?: number;
    wasContacted?: boolean;
    becameQualified?: boolean;
    becameDeal?: boolean;
    becameDeposit?: boolean;
    dealValue?: number;
    depositValue?: number;
  }) {
    return this.learningService.updateOutcome(leadId, outcome);
  }

  /**
   * Статистика та патерни
   */
  async getStats() {
    return this.learningService.getStats();
  }

  async getPatterns() {
    return this.learningService.getPatterns();
  }

  /**
   * Перерахувати патерни вручну
   */
  async recalculatePatterns() {
    return this.learningService.recalculatePatterns();
  }
}
