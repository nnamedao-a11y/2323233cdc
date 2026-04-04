/**
 * Dynamic Weight Engine
 * 
 * Calculates runtime-adjusted trust weights based on live metrics:
 * - successRate → higher = better weight
 * - vinMatchRate → critical for P0
 * - blockRate → penalizes blocked sources
 * - latencyPenalty → slow sources get lower priority
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceHealthTracker } from './source-health-tracker';

// Base static weights
const BASE_SOURCE_TRUST: Record<string, number> = {
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
export class DynamicWeightEngine {
  private readonly logger = new Logger(DynamicWeightEngine.name);

  constructor(private readonly healthTracker: SourceHealthTracker) {}

  /**
   * Get effective weight for a source based on live metrics
   */
  getEffectiveWeight(source: string): number {
    const baseWeight = BASE_SOURCE_TRUST[source] ?? 0.5;
    const stats = this.healthTracker.get(source);

    if (!stats || stats.totalRequests < 5) {
      return baseWeight; // Not enough data
    }

    const successRate = stats.totalRequests > 0
      ? stats.successCount / stats.totalRequests
      : 0.5;

    const vinMatchRate = stats.successCount > 0
      ? stats.vinMatchedCount / stats.successCount
      : 0.5;

    const blockRate = stats.totalRequests > 0
      ? stats.blockedCount / stats.totalRequests
      : 0;

    // Latency penalty
    const latencyPenalty = stats.avgDurationMs > 30000 ? 0.8 : 1;

    // Calculate multiplier
    let multiplier = 1;

    // Success rate impact (0.5 - 1.5)
    multiplier *= 0.5 + successRate;

    // VIN match rate impact (P0 critical) (0.5 - 1.5)
    multiplier *= 0.5 + vinMatchRate;

    // Block rate penalty (up to 70% reduction)
    multiplier *= 1 - blockRate * 0.7;

    // Latency penalty
    multiplier *= latencyPenalty;

    // Clamp to reasonable range
    multiplier = Math.max(0.3, Math.min(1.5, multiplier));

    const effectiveWeight = Number((baseWeight * multiplier).toFixed(3));

    this.logger.debug(
      `[DynamicWeight] ${source}: base=${baseWeight}, multiplier=${multiplier.toFixed(2)}, effective=${effectiveWeight}`
    );

    return effectiveWeight;
  }

  /**
   * Get all effective weights for dashboard
   */
  getAllEffectiveWeights(): Record<string, { base: number; effective: number; multiplier: number }> {
    const result: Record<string, { base: number; effective: number; multiplier: number }> = {};

    for (const [source, baseWeight] of Object.entries(BASE_SOURCE_TRUST)) {
      const effective = this.getEffectiveWeight(source);
      const multiplier = baseWeight > 0 ? effective / baseWeight : 1;

      result[source] = {
        base: baseWeight,
        effective,
        multiplier: Number(multiplier.toFixed(2)),
      };
    }

    return result;
  }

  /**
   * Get dynamic early return threshold based on source trust
   */
  getEarlyReturnThreshold(source: string): number {
    const baseThresholds: Record<string, number> = {
      'Copart': 0.65,
      'IAAI': 0.70,
      'AutoBidMaster': 0.80,
      'BidFax': 0.90,
      'Poctra': 0.90,
      'StatVin': 0.90,
      'LocalDecoder': 0.99, // Never early return from local decoder alone
    };

    const baseThreshold = baseThresholds[source] ?? 0.85;
    
    // Adjust based on health
    const stats = this.healthTracker.get(source);
    if (!stats || stats.totalRequests < 5) {
      return baseThreshold;
    }

    const vinMatchRate = stats.successCount > 0
      ? stats.vinMatchedCount / stats.successCount
      : 0.5;

    // If VIN match rate is high, lower threshold (trust more)
    // If low, raise threshold (require better score)
    if (vinMatchRate > 0.95) {
      return Math.max(0.5, baseThreshold - 0.1);
    } else if (vinMatchRate < 0.7) {
      return Math.min(0.99, baseThreshold + 0.15);
    }

    return baseThreshold;
  }
}
