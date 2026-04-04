import { Injectable } from '@nestjs/common';

export interface LeadSignals {
  // Behavior signals
  vinChecks?: number;
  favorites?: number;
  compare?: number;
  historyRequests?: number;
  returnVisits?: number;
  timeOnSite?: number; // minutes
  
  // Sales signals
  wasContacted?: boolean;
  requestedCallback?: boolean;
  negotiation?: boolean;
  noAnswerAttempts?: number;
  callAttempts?: number;
  
  // Deal signals
  dealBadge?: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'NO_BUY';
  marginSafe?: boolean;
  auctionSoon?: boolean; // within 48h
  estimatedMargin?: number;
  
  // Freshness signals
  lastActivityHours?: number;
  createdHoursAgo?: number;
  firstContactHours?: number;
  
  // Intent from system
  intentScore?: number;
  intentLevel?: string;
}

export interface LeadScore {
  totalScore: number;
  probability: number; // 0-100
  bucket: 'hot' | 'warm' | 'cold';
  breakdown: {
    behavior: number;
    sales: number;
    deal: number;
    freshness: number;
  };
}

@Injectable()
export class PredictiveScoreService {
  
  calculate(signals: LeadSignals): LeadScore {
    let behaviorScore = 0;
    let salesScore = 0;
    let dealScore = 0;
    let freshnessScore = 0;

    // === BEHAVIOR SCORING ===
    if (signals.vinChecks && signals.vinChecks >= 1) behaviorScore += 5;
    if (signals.favorites && signals.favorites >= 1) behaviorScore += 10;
    if (signals.compare && signals.compare >= 1) behaviorScore += 15;
    if (signals.historyRequests && signals.historyRequests >= 1) behaviorScore += 20;
    if (signals.returnVisits && signals.returnVisits >= 2) behaviorScore += 10;
    if (signals.timeOnSite && signals.timeOnSite >= 5) behaviorScore += 5;

    // Cap behavior score
    behaviorScore = Math.min(behaviorScore, 50);

    // === SALES SCORING ===
    if (signals.wasContacted) salesScore += 10;
    if (signals.requestedCallback) salesScore += 15;
    if (signals.negotiation) salesScore += 20;
    
    // Penalty for no answer
    if (signals.noAnswerAttempts && signals.noAnswerAttempts >= 3) {
      salesScore -= 15;
    }

    // Intent from system
    if (signals.intentScore) {
      salesScore += Math.min(signals.intentScore * 2, 20);
    }

    // === DEAL SCORING ===
    if (signals.dealBadge === 'STRONG_BUY') dealScore += 20;
    else if (signals.dealBadge === 'BUY') dealScore += 10;
    else if (signals.dealBadge === 'HOLD') dealScore += 0;
    else if (signals.dealBadge === 'NO_BUY') dealScore -= 10;

    if (signals.marginSafe) dealScore += 10;
    if (signals.auctionSoon) dealScore += 10;

    if (signals.estimatedMargin && signals.estimatedMargin > 500) {
      dealScore += 10;
    }

    // === FRESHNESS SCORING ===
    const hours = signals.lastActivityHours || signals.createdHoursAgo || 999;
    
    if (hours <= 2) freshnessScore += 15;
    else if (hours <= 6) freshnessScore += 12;
    else if (hours <= 24) freshnessScore += 8;
    else if (hours <= 48) freshnessScore += 4;
    else freshnessScore -= 5;

    // Bonus for quick first contact
    if (signals.firstContactHours && signals.firstContactHours < 1) {
      freshnessScore += 5;
    }

    // === TOTAL SCORE ===
    const totalScore = behaviorScore + salesScore + dealScore + freshnessScore;

    // === BUCKET ===
    let bucket: 'hot' | 'warm' | 'cold';
    if (totalScore >= 70) bucket = 'hot';
    else if (totalScore >= 40) bucket = 'warm';
    else bucket = 'cold';

    // Override bucket for high intent
    if (signals.intentLevel === 'hot') bucket = 'hot';

    // === PROBABILITY ===
    const probability = Math.min(95, Math.max(5, totalScore));

    return {
      totalScore,
      probability,
      bucket,
      breakdown: {
        behavior: behaviorScore,
        sales: salesScore,
        deal: dealScore,
        freshness: freshnessScore,
      },
    };
  }
}
