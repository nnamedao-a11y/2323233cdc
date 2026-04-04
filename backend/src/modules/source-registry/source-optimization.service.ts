/**
 * Source Optimization Service
 * 
 * Автоматична оптимізація ваг джерел на основі їх продуктивності
 * 
 * Формула: effectiveWeight = manualWeight * systemScore
 * 
 * systemScore = (
 *   successRate * 0.35 +
 *   exactMatchRate * 0.30 +
 *   responseScore * 0.15 +
 *   freshnessScore * 0.10 +
 *   (1 - emptyRate) * 0.05 +
 *   (1 - invalidRate) * 0.05
 * )
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceRegistryService } from './source-registry.service';

@Injectable()
export class SourceOptimizationService {
  private readonly logger = new Logger(SourceOptimizationService.name);

  constructor(private readonly registry: SourceRegistryService) {}

  /**
   * Recompute system scores for all sources
   */
  async recomputeAll(): Promise<{ updated: number; disabled: number; enabled: number }> {
    const sources = await this.registry.getAll();
    let updated = 0;
    let disabled = 0;
    let enabled = 0;

    for (const source of sources) {
      const total = source.totalSearches || 0;

      // Not enough data - keep neutral score
      if (total < 5) {
        await this.registry.setSystemScore(source.name, 1);
        continue;
      }

      // Calculate rates
      const successRate = total > 0 ? (source.successCount || 0) / total : 0;
      const exactMatchRate = total > 0 ? (source.exactMatchCount || 0) / total : 0;
      const emptyRate = total > 0 ? (source.emptyResultCount || 0) / total : 0;
      const invalidRate = total > 0 ? (source.invalidResultCount || 0) / total : 0;

      // Performance scores
      const responseScore = this.calculateResponseScore(source.avgResponseTime || 0);
      const freshnessScore = this.calculateFreshnessScore(
        source.lastSuccessAt ? new Date(source.lastSuccessAt) : null
      );

      // Weighted system score
      const systemScore = this.clamp(
        successRate * 0.35 +
        exactMatchRate * 0.30 +
        responseScore * 0.15 +
        freshnessScore * 0.10 +
        (1 - emptyRate) * 0.05 +
        (1 - invalidRate) * 0.05
      );

      await this.registry.setSystemScore(source.name, systemScore);
      updated++;

      this.logger.debug(
        `[${source.name}] success=${(successRate * 100).toFixed(1)}% ` +
        `exact=${(exactMatchRate * 100).toFixed(1)}% ` +
        `systemScore=${systemScore.toFixed(3)}`
      );

      // Auto-disable rule: very poor performance
      if (
        total >= 15 &&
        successRate < 0.15 &&
        exactMatchRate < 0.10 &&
        (source.consecutiveFailCount || 0) >= 5
      ) {
        await this.registry.autoDisable(
          source.name,
          `Auto-disabled: low success rate (${(successRate * 100).toFixed(1)}%), ` +
          `low exact match (${(exactMatchRate * 100).toFixed(1)}%), ` +
          `${source.consecutiveFailCount} consecutive fails`
        );
        disabled++;
        continue;
      }

      // Auto-recover rule: source improved
      if (source.autoDisabled && successRate > 0.50 && exactMatchRate > 0.30) {
        await this.registry.autoEnable(source.name);
        enabled++;
        this.logger.log(`Source ${source.name} auto-enabled after recovery`);
      }
    }

    this.logger.log(
      `Optimization complete: ${updated} updated, ${disabled} auto-disabled, ${enabled} auto-enabled`
    );

    return { updated, disabled, enabled };
  }

  /**
   * Score based on response time (faster = better)
   */
  private calculateResponseScore(avgMs: number): number {
    if (!avgMs || avgMs <= 0) return 0.5;
    if (avgMs <= 500) return 1.0;
    if (avgMs <= 1000) return 0.9;
    if (avgMs <= 2000) return 0.8;
    if (avgMs <= 4000) return 0.6;
    if (avgMs <= 8000) return 0.4;
    return 0.2;
  }

  /**
   * Score based on freshness of last success (recent = better)
   */
  private calculateFreshnessScore(lastSuccessAt: Date | null): number {
    if (!lastSuccessAt) return 0.2;
    
    const hoursAgo = (Date.now() - new Date(lastSuccessAt).getTime()) / (1000 * 60 * 60);
    
    if (hoursAgo <= 1) return 1.0;
    if (hoursAgo <= 6) return 0.8;
    if (hoursAgo <= 24) return 0.6;
    if (hoursAgo <= 72) return 0.4;
    return 0.2;
  }

  /**
   * Clamp value between 0.1 and 1.0
   */
  private clamp(value: number): number {
    return Number(Math.max(0.1, Math.min(1, value)).toFixed(3));
  }

  /**
   * Get optimization report
   */
  async getReport(): Promise<{
    sources: Array<{
      name: string;
      displayName: string;
      type: string;
      enabled: boolean;
      autoDisabled: boolean;
      manualWeight: number;
      systemScore: number;
      effectiveWeight: number;
      totalSearches: number;
      successRate: number;
      exactMatchRate: number;
      avgResponseTime: number;
      health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    }>;
  }> {
    const sources = await this.registry.getAll();

    return {
      sources: sources.map(source => {
        const total = source.totalSearches || 0;
        const successRate = total > 0 ? (source.successCount || 0) / total : 0;
        const exactMatchRate = total > 0 ? (source.exactMatchCount || 0) / total : 0;

        // Determine health status
        let health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' = 'fair';
        if (total < 5) {
          health = 'fair'; // Not enough data
        } else if (successRate >= 0.8 && exactMatchRate >= 0.6) {
          health = 'excellent';
        } else if (successRate >= 0.6 && exactMatchRate >= 0.4) {
          health = 'good';
        } else if (successRate >= 0.4 && exactMatchRate >= 0.2) {
          health = 'fair';
        } else if (successRate >= 0.2) {
          health = 'poor';
        } else {
          health = 'critical';
        }

        return {
          name: source.name,
          displayName: source.displayName || source.name,
          type: source.type,
          enabled: source.enabled,
          autoDisabled: source.autoDisabled || false,
          manualWeight: source.manualWeight || 0.7,
          systemScore: source.systemScore || 1,
          effectiveWeight: source.effectiveWeight || 0.7,
          totalSearches: total,
          successRate: Number(successRate.toFixed(3)),
          exactMatchRate: Number(exactMatchRate.toFixed(3)),
          avgResponseTime: source.avgResponseTime || 0,
          health,
        };
      }),
    };
  }
}
