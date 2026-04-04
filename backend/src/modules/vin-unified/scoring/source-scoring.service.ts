/**
 * Source Confidence Scoring Service
 * 
 * Calculates confidence score for each source result:
 * - Source trust weight (Copart > AutoBidMaster > LocalDecoder)
 * - VIN match bonus
 * - Data completeness
 * - Response freshness
 * - Speed score
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExtractedVehicle } from '../dto/vin.dto';

export interface ScoredSourceResult extends ExtractedVehicle {
  vinMatched: boolean;
  trustScore: number;
  completenessScore: number;
  freshnessScore: number;
  speedScore: number;
  totalScore: number;
}

// Source trust weights - higher = more trustworthy
const SOURCE_TRUST: Record<string, number> = {
  'LocalDecoder': 0.45,
  'Copart': 0.95,
  'IAAI': 0.90,
  'AutoBidMaster': 0.75,
  'SalvageReseller': 0.70,
  'BidFax': 0.65,
  'Poctra': 0.60,
  'StatVin': 0.60,
};

@Injectable()
export class SourceScoringService {
  private readonly logger = new Logger(SourceScoringService.name);

  /**
   * Score all source results and filter invalid ones
   */
  scoreResults(inputVin: string, vehicles: ExtractedVehicle[]): ScoredSourceResult[] {
    const normalizedInput = this.normalizeVin(inputVin);
    const scored: ScoredSourceResult[] = [];

    for (const vehicle of vehicles) {
      const result = this.scoreSourceResult(normalizedInput, vehicle);
      scored.push(result);
    }

    // Sort by total score descending
    scored.sort((a, b) => b.totalScore - a.totalScore);

    this.logger.log(
      `[SourceScoring] Scored ${scored.length} results. ` +
      `VIN-matched: ${scored.filter(s => s.vinMatched).length}. ` +
      `Top score: ${scored[0]?.totalScore.toFixed(2) || 'N/A'}`
    );

    return scored;
  }

  /**
   * Filter to only VIN-matched results
   */
  filterValidResults(scored: ScoredSourceResult[]): ScoredSourceResult[] {
    return scored.filter(r => r.vinMatched && r.totalScore > 0);
  }

  /**
   * Get best result by score
   */
  getBestResult(scored: ScoredSourceResult[]): ScoredSourceResult | null {
    const valid = this.filterValidResults(scored);
    return valid.length > 0 ? valid[0] : null;
  }

  /**
   * Score a single source result
   */
  private scoreSourceResult(inputVin: string, vehicle: ExtractedVehicle): ScoredSourceResult {
    const extractedVin = this.normalizeVin(vehicle.vin || '');
    const vinMatched = this.vinsEqual(inputVin, extractedVin);

    const trust = SOURCE_TRUST[vehicle.source] ?? 0.3;
    const completeness = this.calculateCompletenessScore(vehicle);
    const freshness = this.calculateFreshnessScore(vehicle);
    const speed = this.calculateSpeedScore(vehicle.responseTime || 0);

    // Weighted total score
    let total =
      trust * 0.45 +
      completeness * 0.30 +
      freshness * 0.15 +
      speed * 0.10;

    // VIN match bonus/penalty (CRITICAL)
    if (vinMatched) {
      total += 0.25;
    } else {
      // Severe penalty for VIN mismatch - this is P0 bug fix
      total -= 0.75;
    }

    // Penalty if extraction failed
    if (!vehicle.confidence || vehicle.confidence < 0.3) {
      total -= 0.5;
    }

    return {
      ...vehicle,
      vinMatched,
      trustScore: trust,
      completenessScore: completeness,
      freshnessScore: freshness,
      speedScore: speed,
      totalScore: Number(total.toFixed(4)),
    };
  }

  /**
   * Calculate completeness score based on available data
   */
  private calculateCompletenessScore(vehicle: ExtractedVehicle): number {
    let score = 0;

    // Vehicle basics
    if (vehicle.year) score += 0.08;
    if (vehicle.make) score += 0.08;
    if (vehicle.model) score += 0.08;
    if (vehicle.trim) score += 0.04;

    // Auction data (more valuable)
    if (vehicle.lotNumber) score += 0.12;
    if (vehicle.source && vehicle.source !== 'LocalDecoder') score += 0.06;
    if (vehicle.saleDate) score += 0.05;
    if (typeof vehicle.price === 'number' && vehicle.price > 0) score += 0.10;
    if (typeof vehicle.mileage === 'number' && vehicle.mileage > 0) score += 0.08;
    if (vehicle.damageType || vehicle.primaryDamage) score += 0.05;

    // Images
    if (vehicle.images && vehicle.images.length > 0) score += 0.10;
    if (vehicle.images && vehicle.images.length > 5) score += 0.05;

    // URL
    if (vehicle.sourceUrl) score += 0.05;

    return Math.min(score, 1);
  }

  /**
   * Calculate freshness score based on extraction time
   */
  private calculateFreshnessScore(vehicle: ExtractedVehicle): number {
    if (!vehicle.extractedAt) return 0.5;

    const extractedTime = new Date(vehicle.extractedAt).getTime();
    const ageMs = Date.now() - extractedTime;
    const ageMinutes = ageMs / (1000 * 60);

    // Fresh data is better
    if (ageMinutes <= 5) return 1.0;
    if (ageMinutes <= 30) return 0.9;
    if (ageMinutes <= 60) return 0.7;
    if (ageMinutes <= 1440) return 0.5; // 24 hours
    return 0.3;
  }

  /**
   * Calculate speed score based on response time
   */
  private calculateSpeedScore(responseTimeMs: number): number {
    if (responseTimeMs <= 1000) return 1.0;
    if (responseTimeMs <= 5000) return 0.8;
    if (responseTimeMs <= 15000) return 0.6;
    if (responseTimeMs <= 30000) return 0.4;
    return 0.2;
  }

  /**
   * Normalize VIN for comparison
   */
  private normalizeVin(vin: string): string {
    return (vin || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, '');
  }

  /**
   * Compare two VINs (P0 critical function)
   */
  private vinsEqual(a: string, b: string): boolean {
    if (!a || !b) return false;
    return this.normalizeVin(a) === this.normalizeVin(b);
  }
}
