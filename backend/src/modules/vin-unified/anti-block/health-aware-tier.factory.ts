/**
 * Health-Aware Tier Factory
 * 
 * Builds source tiers with ADAPTIVE delays based on live metrics:
 * - Copart avg = 9s → secondary delay = ~6s
 * - Copart degraded → secondary starts earlier
 * - Source blocked/degraded → excluded from tier
 * 
 * SIMPLE 2-SOURCE STRATEGY:
 * - Tier 1: Copart (primary)
 * - Tier 2: IAAI (fallback)
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceHealthTracker } from './source-health-tracker';
import { DiscoveredSource } from '../dto/vin.dto';

export interface SourceTierConfig {
  tierName: string;
  sources: DiscoveredSource[];
  startAfterMs: number;
  skipIfDegraded?: boolean;
}

@Injectable()
export class HealthAwareTierFactory {
  private readonly logger = new Logger(HealthAwareTierFactory.name);

  constructor(private readonly healthTracker: SourceHealthTracker) {}

  /**
   * Build adaptive tiers based on live source health
   */
  buildAdaptiveTiers(sources: DiscoveredSource[]): SourceTierConfig[] {
    const byName = new Map(sources.map(s => [s.name, s]));

    // Get live metrics for adaptive delays
    const copartStats = this.healthTracker.get('Copart');
    const iaaiStats = this.healthTracker.get('IAAI');

    // Calculate adaptive delays
    const copartAvgMs = copartStats?.avgDurationMs || 15000;
    const copartSuccessRate = copartStats?.totalRequests > 0
      ? copartStats.successCount / copartStats.totalRequests
      : 0.5;

    // If Copart is fast and reliable → delay secondary more
    // If Copart is slow/unreliable → start secondary earlier
    let secondaryDelay: number;
    if (copartSuccessRate > 0.9 && copartAvgMs < 12000) {
      // Copart is excellent → delay secondary
      secondaryDelay = Math.floor(copartAvgMs * 0.8);
    } else if (copartSuccessRate < 0.5 || copartStats?.degraded) {
      // Copart is poor → start secondary immediately
      secondaryDelay = 0;
    } else {
      // Normal case
      secondaryDelay = Math.max(3000, Math.min(10000, Math.floor(copartAvgMs * 0.6)));
    }

    this.logger.log(
      `[TierFactory] Copart: avgMs=${copartAvgMs}, success=${(copartSuccessRate * 100).toFixed(0)}%, ` +
      `secondaryDelay=${secondaryDelay}ms`
    );

    // Build tiers with health awareness
    const tiers: SourceTierConfig[] = [];

    // Tier 1: Primary sources (Copart, CopartDirect)
    const tier1Sources = ['Copart', 'CopartDirect', 'IAAI']
      .map(name => byName.get(name))
      .filter(s => s && !this.isHardDegraded(s.name)) as DiscoveredSource[];

    if (tier1Sources.length > 0) {
      tiers.push({
        tierName: 'tier-1-primary',
        sources: tier1Sources,
        startAfterMs: 0,
      });
    }

    // Tier 2: Secondary sources (AutoBidMaster, SalvageReseller)
    const tier2Sources = ['AutoBidMaster', 'SalvageReseller']
      .map(name => byName.get(name))
      .filter(s => s && !this.isHardDegraded(s.name)) as DiscoveredSource[];

    if (tier2Sources.length > 0) {
      tiers.push({
        tierName: 'tier-2-secondary',
        sources: tier2Sources,
        startAfterMs: secondaryDelay,
      });
    }

    // Tier 3: Fallback (blocked sources - only if really needed)
    const fallbackDelay = Math.max(10000, Math.floor(copartAvgMs * 1.5));
    const tier3Sources = ['BidFax', 'Poctra', 'StatVin', 'VehicleHistory']
      .map(name => byName.get(name))
      .filter(s => s && !this.isHardDegraded(s.name)) as DiscoveredSource[];

    if (tier3Sources.length > 0) {
      tiers.push({
        tierName: 'tier-3-fallback',
        sources: tier3Sources,
        startAfterMs: fallbackDelay,
        skipIfDegraded: true,
      });
    }

    this.logger.log(
      `[TierFactory] Built ${tiers.length} tiers: ` +
      tiers.map(t => `${t.tierName}(${t.sources.length}@${t.startAfterMs}ms)`).join(', ')
    );

    return tiers;
  }

  /**
   * Check if source should be completely excluded
   */
  private isHardDegraded(sourceName: string): boolean {
    const stats = this.healthTracker.get(sourceName);
    if (!stats || stats.totalRequests < 5) return false;

    const failRate = stats.failedCount / stats.totalRequests;
    const blockRate = stats.blockedCount / stats.totalRequests;
    const vinMatchRate = stats.successCount > 0
      ? stats.vinMatchedCount / stats.successCount
      : 1;

    // Hard degrade if:
    // - >60% fail rate
    // - >40% block rate
    // - <50% VIN match rate (P0 critical)
    const isDegraded = failRate > 0.6 || blockRate > 0.4 || vinMatchRate < 0.5;

    if (isDegraded) {
      this.logger.warn(
        `[TierFactory] HARD DEGRADED: ${sourceName} ` +
        `(fail=${(failRate * 100).toFixed(0)}%, block=${(blockRate * 100).toFixed(0)}%, vinMatch=${(vinMatchRate * 100).toFixed(0)}%)`
      );
    }

    return isDegraded;
  }

  /**
   * Should we skip secondary tier entirely?
   * (When primary is fast and reliable)
   */
  shouldSkipSecondary(): boolean {
    const copart = this.healthTracker.get('Copart');
    if (!copart || copart.totalRequests < 10) return false;

    const successRate = copart.successCount / copart.totalRequests;
    const vinMatchRate = copart.successCount > 0
      ? copart.vinMatchedCount / copart.successCount
      : 0;

    // Skip secondary if Copart is excellent
    return successRate > 0.95 && vinMatchRate > 0.95 && copart.avgDurationMs < 10000;
  }

  /**
   * Get current system status
   */
  getSystemStatus(): {
    primaryHealthy: boolean;
    secondaryAvailable: boolean;
    recommendedStrategy: 'primary-only' | 'primary-fallback' | 'parallel';
  } {
    const copart = this.healthTracker.get('Copart');
    const iaai = this.healthTracker.get('IAAI');

    const copartHealthy = copart && !copart.degraded && 
      (copart.totalRequests < 5 || copart.successCount / copart.totalRequests > 0.5);

    const iaaiHealthy = iaai && !iaai.degraded &&
      (iaai.totalRequests < 5 || iaai.successCount / iaai.totalRequests > 0.5);

    let strategy: 'primary-only' | 'primary-fallback' | 'parallel';
    
    if (copartHealthy && this.shouldSkipSecondary()) {
      strategy = 'primary-only';
    } else if (copartHealthy) {
      strategy = 'primary-fallback';
    } else {
      strategy = 'parallel';
    }

    return {
      primaryHealthy: !!copartHealthy,
      secondaryAvailable: !!iaaiHealthy,
      recommendedStrategy: strategy,
    };
  }
}
