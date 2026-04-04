/**
 * VIN Dashboard Controller
 * 
 * Admin endpoints for monitoring VIN parser health:
 * - Source metrics (success rate, VIN match rate, latency)
 * - Dynamic weights
 * - Recent resolves
 */

import { Controller, Get, Param } from '@nestjs/common';
import { SourceHealthTracker, SourceHealth } from '../anti-block/source-health-tracker';
import { DynamicWeightEngine } from '../anti-block/dynamic-weight.engine';

interface SourceDashboardData {
  source: string;
  health: {
    successRate: string;
    vinMatchRate: string;
    blockRate: string;
    timeoutRate: string;
  };
  performance: {
    avgLatencyMs: number;
    avgScore: number;
    totalRequests: number;
  };
  weights: {
    base: number;
    effective: number;
    multiplier: number;
  };
  flags: {
    degraded: boolean;
    lastError: string | null;
    lastSeenAt: string | null;
  };
}

@Controller('/api/admin/vin-dashboard')
export class VinDashboardController {
  constructor(
    private readonly healthTracker: SourceHealthTracker,
    private readonly weightEngine: DynamicWeightEngine,
  ) {}

  /**
   * Get all source metrics
   */
  @Get('/sources')
  async getAllSources(): Promise<SourceDashboardData[]> {
    const allHealth = this.healthTracker.getAll();
    const allWeights = this.weightEngine.getAllEffectiveWeights();

    const result: SourceDashboardData[] = [];

    // Add known sources with or without data
    const knownSources = [
      'LocalDecoder', 'Copart', 'IAAI', 'AutoBidMaster', 
      'SalvageReseller', 'BidFax', 'Poctra', 'StatVin'
    ];

    for (const sourceName of knownSources) {
      const health = allHealth.find(h => h.source === sourceName);
      const weights = allWeights[sourceName] || { base: 0.5, effective: 0.5, multiplier: 1 };

      result.push(this.formatSourceData(sourceName, health, weights));
    }

    // Add any additional sources from health data
    for (const health of allHealth) {
      if (!knownSources.includes(health.source)) {
        const weights = allWeights[health.source] || { base: 0.5, effective: 0.5, multiplier: 1 };
        result.push(this.formatSourceData(health.source, health, weights));
      }
    }

    // Sort by effective weight (best sources first)
    result.sort((a, b) => b.weights.effective - a.weights.effective);

    return result;
  }

  /**
   * Get single source metrics
   */
  @Get('/sources/:source')
  async getSource(@Param('source') source: string): Promise<SourceDashboardData | null> {
    const health = this.healthTracker.get(source);
    const weights = this.weightEngine.getAllEffectiveWeights()[source] || {
      base: 0.5,
      effective: this.weightEngine.getEffectiveWeight(source),
      multiplier: 1,
    };

    return this.formatSourceData(source, health, weights);
  }

  /**
   * Get overall system status
   */
  @Get('/status')
  async getStatus() {
    const allHealth = this.healthTracker.getAll();
    const allWeights = this.weightEngine.getAllEffectiveWeights();

    const totalRequests = allHealth.reduce((sum, h) => sum + h.totalRequests, 0);
    const totalSuccess = allHealth.reduce((sum, h) => sum + h.successCount, 0);
    const totalBlocked = allHealth.reduce((sum, h) => sum + h.blockedCount, 0);

    const degradedSources = allHealth.filter(h => h.degraded).map(h => h.source);
    const healthySources = allHealth.filter(h => !h.degraded && h.successCount > 0).map(h => h.source);

    return {
      overview: {
        totalRequests,
        overallSuccessRate: totalRequests > 0 
          ? ((totalSuccess / totalRequests) * 100).toFixed(1) + '%'
          : 'N/A',
        overallBlockRate: totalRequests > 0
          ? ((totalBlocked / totalRequests) * 100).toFixed(1) + '%'
          : 'N/A',
      },
      sources: {
        healthy: healthySources,
        degraded: degradedSources,
        total: Object.keys(allWeights).length,
      },
      topSources: Object.entries(allWeights)
        .sort((a, b) => b[1].effective - a[1].effective)
        .slice(0, 3)
        .map(([name, w]) => ({ name, effectiveWeight: w.effective })),
    };
  }

  /**
   * Reset source stats (for testing)
   */
  @Get('/sources/:source/reset')
  async resetSource(@Param('source') source: string) {
    this.healthTracker.reset(source);
    return { success: true, message: `Stats reset for ${source}` };
  }

  private formatSourceData(
    sourceName: string,
    health: SourceHealth | undefined,
    weights: { base: number; effective: number; multiplier: number }
  ): SourceDashboardData {
    if (!health) {
      return {
        source: sourceName,
        health: {
          successRate: 'N/A',
          vinMatchRate: 'N/A',
          blockRate: 'N/A',
          timeoutRate: 'N/A',
        },
        performance: {
          avgLatencyMs: 0,
          avgScore: 0,
          totalRequests: 0,
        },
        weights: {
          base: weights.base,
          effective: weights.effective,
          multiplier: weights.multiplier,
        },
        flags: {
          degraded: false,
          lastError: null,
          lastSeenAt: null,
        },
      };
    }

    const successRate = health.totalRequests > 0
      ? ((health.successCount / health.totalRequests) * 100).toFixed(1) + '%'
      : 'N/A';

    const vinMatchRate = health.successCount > 0
      ? ((health.vinMatchedCount / health.successCount) * 100).toFixed(1) + '%'
      : 'N/A';

    const blockRate = health.totalRequests > 0
      ? ((health.blockedCount / health.totalRequests) * 100).toFixed(1) + '%'
      : 'N/A';

    const timeoutRate = health.totalRequests > 0
      ? ((health.timeoutCount / health.totalRequests) * 100).toFixed(1) + '%'
      : 'N/A';

    return {
      source: sourceName,
      health: {
        successRate,
        vinMatchRate,
        blockRate,
        timeoutRate,
      },
      performance: {
        avgLatencyMs: Math.round(health.avgDurationMs),
        avgScore: Number(health.avgScore.toFixed(2)),
        totalRequests: health.totalRequests,
      },
      weights: {
        base: weights.base,
        effective: weights.effective,
        multiplier: weights.multiplier,
      },
      flags: {
        degraded: health.degraded,
        lastError: health.lastError || null,
        lastSeenAt: health.lastSeenAt?.toISOString() || null,
      },
    };
  }
}
