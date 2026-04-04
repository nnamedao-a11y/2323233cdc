/**
 * Source Health Service
 * 
 * Моніторинг здоров'я джерел:
 * - Hit rate
 * - Latency
 * - Success/failure tracking
 * - Auto-quarantine
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SourceHealth {
  name: string;
  tier: number;
  status: 'active' | 'degraded' | 'quarantine' | 'disabled';
  hitRate: number;
  avgLatency: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  lastCheck: Date | null;
  consecutiveFailures: number;
  quarantineUntil: Date | null;
  score: number;
}

export interface SourceHealthSummary {
  totalSources: number;
  activeSources: number;
  degradedSources: number;
  quarantinedSources: number;
  disabledSources: number;
  overallHitRate: number;
  avgLatency: number;
  lastUpdated: Date;
  sources: SourceHealth[];
}

@Injectable()
export class SourceHealthService {
  private readonly logger = new Logger(SourceHealthService.name);
  
  // In-memory health tracking (could be moved to Redis/MongoDB)
  private healthMap = new Map<string, SourceHealth>();
  
  // Source definitions
  private readonly sources = [
    { name: 'NHTSA', tier: 1, enabled: true },
    { name: 'IAAI', tier: 1, enabled: true },
    { name: 'FaxVIN', tier: 1, enabled: true },
    { name: 'SalvageBid', tier: 1, enabled: true },
    { name: 'BidFax', tier: 2, enabled: true },
    { name: 'Poctra', tier: 2, enabled: true },
    { name: 'AutoBidMaster', tier: 2, enabled: true },
    { name: 'StatVin', tier: 2, enabled: false }, // Disabled - 404 errors
    { name: 'ClearVin', tier: 3, enabled: true },
    { name: 'VinDecoderz', tier: 3, enabled: true },
    { name: 'Copart', tier: 4, enabled: false }, // Disabled - anti-bot
  ];

  constructor() {
    this.initializeHealth();
  }

  private initializeHealth() {
    for (const source of this.sources) {
      this.healthMap.set(source.name, {
        name: source.name,
        tier: source.tier,
        status: source.enabled ? 'active' : 'disabled',
        hitRate: 0,
        avgLatency: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        lastSuccess: null,
        lastFailure: null,
        lastCheck: null,
        consecutiveFailures: 0,
        quarantineUntil: null,
        score: source.enabled ? 0.5 : 0,
      });
    }
  }

  /**
   * Record a successful extraction
   */
  recordSuccess(sourceName: string, latencyMs: number): void {
    const health = this.healthMap.get(sourceName);
    if (!health) return;

    health.totalRequests++;
    health.successfulRequests++;
    health.lastSuccess = new Date();
    health.lastCheck = new Date();
    health.consecutiveFailures = 0;

    // Update latency (moving average)
    if (health.avgLatency === 0) {
      health.avgLatency = latencyMs;
    } else {
      health.avgLatency = (health.avgLatency * 0.8) + (latencyMs * 0.2);
    }

    // Update hit rate
    health.hitRate = health.successfulRequests / health.totalRequests;

    // Update score
    this.updateScore(health);

    // Maybe promote from degraded
    if (health.status === 'degraded' && health.consecutiveFailures === 0) {
      health.status = 'active';
      this.logger.log(`[SourceHealth] ${sourceName} promoted to active`);
    }

    // Exit quarantine
    if (health.status === 'quarantine') {
      health.status = 'active';
      health.quarantineUntil = null;
      this.logger.log(`[SourceHealth] ${sourceName} exited quarantine`);
    }
  }

  /**
   * Record a failed extraction
   */
  recordFailure(sourceName: string, reason?: string): void {
    const health = this.healthMap.get(sourceName);
    if (!health) return;

    health.totalRequests++;
    health.failedRequests++;
    health.lastFailure = new Date();
    health.lastCheck = new Date();
    health.consecutiveFailures++;

    // Update hit rate
    health.hitRate = health.successfulRequests / health.totalRequests;

    // Update score
    this.updateScore(health);

    // Maybe degrade
    if (health.consecutiveFailures >= 3 && health.status === 'active') {
      health.status = 'degraded';
      this.logger.warn(`[SourceHealth] ${sourceName} degraded (${health.consecutiveFailures} consecutive failures)`);
    }

    // Maybe quarantine
    if (health.consecutiveFailures >= 10) {
      health.status = 'quarantine';
      health.quarantineUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      this.logger.warn(`[SourceHealth] ${sourceName} quarantined until ${health.quarantineUntil}`);
    }
  }

  /**
   * Calculate source score
   */
  private updateScore(health: SourceHealth): void {
    // Score formula:
    // hitRate * 0.35 + completeness * 0.30 + freshness * 0.20 + latency * 0.05 - falsePositivePenalty * 0.10
    
    const hitRateScore = health.hitRate * 0.35;
    
    // Completeness - assume based on tier
    const completenessScore = (1 - (health.tier - 1) * 0.15) * 0.30;
    
    // Freshness - based on last success
    let freshnessScore = 0;
    if (health.lastSuccess) {
      const hoursSinceSuccess = (Date.now() - health.lastSuccess.getTime()) / (1000 * 60 * 60);
      freshnessScore = Math.max(0, 1 - hoursSinceSuccess / 24) * 0.20;
    }
    
    // Latency score (lower is better, cap at 10s)
    const latencyScore = Math.max(0, 1 - health.avgLatency / 10000) * 0.05;
    
    // False positive penalty
    const fpPenalty = health.failedRequests > 0 
      ? (health.failedRequests / health.totalRequests) * 0.10 
      : 0;
    
    health.score = Math.max(0, Math.min(1, hitRateScore + completenessScore + freshnessScore + latencyScore - fpPenalty));
  }

  /**
   * Get health summary for dashboard
   */
  getSummary(): SourceHealthSummary {
    const sources = Array.from(this.healthMap.values()).sort((a, b) => b.score - a.score);
    
    const activeSources = sources.filter(s => s.status === 'active').length;
    const degradedSources = sources.filter(s => s.status === 'degraded').length;
    const quarantinedSources = sources.filter(s => s.status === 'quarantine').length;
    const disabledSources = sources.filter(s => s.status === 'disabled').length;
    
    const enabledSources = sources.filter(s => s.status !== 'disabled');
    const overallHitRate = enabledSources.length > 0
      ? enabledSources.reduce((sum, s) => sum + s.hitRate, 0) / enabledSources.length
      : 0;
    
    const avgLatency = enabledSources.length > 0
      ? enabledSources.reduce((sum, s) => sum + s.avgLatency, 0) / enabledSources.length
      : 0;

    return {
      totalSources: sources.length,
      activeSources,
      degradedSources,
      quarantinedSources,
      disabledSources,
      overallHitRate: Math.round(overallHitRate * 100) / 100,
      avgLatency: Math.round(avgLatency),
      lastUpdated: new Date(),
      sources,
    };
  }

  /**
   * Get health for specific source
   */
  getSourceHealth(sourceName: string): SourceHealth | null {
    return this.healthMap.get(sourceName) || null;
  }

  /**
   * Check if source is available (not quarantined/disabled)
   */
  isSourceAvailable(sourceName: string): boolean {
    const health = this.healthMap.get(sourceName);
    if (!health) return false;
    
    if (health.status === 'disabled') return false;
    
    if (health.status === 'quarantine') {
      if (health.quarantineUntil && health.quarantineUntil > new Date()) {
        return false;
      }
      // Quarantine expired
      health.status = 'degraded';
      health.quarantineUntil = null;
    }
    
    return true;
  }

  /**
   * Get sources sorted by score (for priority ordering)
   */
  getSourcesByScore(): string[] {
    return Array.from(this.healthMap.values())
      .filter(s => this.isSourceAvailable(s.name))
      .sort((a, b) => b.score - a.score)
      .map(s => s.name);
  }

  /**
   * Reset health stats (for testing)
   */
  reset(): void {
    this.initializeHealth();
  }
}
