/**
 * Source Health Tracker
 * 
 * Tracks success/failure rates per source to enable:
 * - Dynamic scoring weights
 * - Source degradation
 * - Performance monitoring
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SourceHealth {
  source: string;
  totalRequests: number;
  successCount: number;
  vinMatchedCount: number;
  blockedCount: number;
  failedCount: number;
  timeoutCount: number;
  avgDurationMs: number;
  avgScore: number;
  lastError?: string;
  lastSeenAt?: Date;
  degraded: boolean;
}

@Injectable()
export class SourceHealthTracker {
  private readonly logger = new Logger(SourceHealthTracker.name);
  private stats = new Map<string, SourceHealth>();

  recordSuccess(
    source: string,
    durationMs: number,
    vinMatched: boolean,
    score?: number
  ) {
    const s = this.getOrCreate(source);
    s.totalRequests += 1;
    s.successCount += 1;
    if (vinMatched) s.vinMatchedCount += 1;
    s.avgDurationMs = this.nextAvg(s.avgDurationMs, durationMs, s.totalRequests);
    if (typeof score === 'number') {
      s.avgScore = this.nextAvg(s.avgScore, score, s.successCount);
    }
    s.lastSeenAt = new Date();
    s.degraded = this.shouldDegrade(s);
  }

  recordBlocked(source: string, reason: string) {
    const s = this.getOrCreate(source);
    s.totalRequests += 1;
    s.blockedCount += 1;
    s.lastError = reason;
    s.lastSeenAt = new Date();
    s.degraded = this.shouldDegrade(s);
    
    this.logger.warn(`[SourceHealth] ${source} blocked: ${reason}`);
  }

  recordFailure(source: string, reason: string) {
    const s = this.getOrCreate(source);
    s.totalRequests += 1;
    s.failedCount += 1;
    s.lastError = reason;
    s.lastSeenAt = new Date();
    s.degraded = this.shouldDegrade(s);
  }

  recordTimeout(source: string) {
    const s = this.getOrCreate(source);
    s.totalRequests += 1;
    s.timeoutCount += 1;
    s.lastSeenAt = new Date();
    s.degraded = this.shouldDegrade(s);
  }

  get(source: string): SourceHealth {
    return this.getOrCreate(source);
  }

  getAll(): SourceHealth[] {
    return Array.from(this.stats.values());
  }

  /**
   * Get dynamic trust multiplier based on health
   */
  getTrustMultiplier(source: string): number {
    const s = this.stats.get(source);
    if (!s || s.totalRequests < 5) return 1.0; // Not enough data

    const successRate = s.successCount / s.totalRequests;
    const vinMatchRate = s.successCount > 0 
      ? s.vinMatchedCount / s.successCount 
      : 0;
    const blockRate = s.blockedCount / s.totalRequests;

    // Calculate multiplier
    let multiplier = 1.0;

    // Penalize low success rate
    if (successRate < 0.5) multiplier *= 0.7;
    else if (successRate < 0.7) multiplier *= 0.85;

    // Penalize low VIN match rate (P0 critical)
    if (vinMatchRate < 0.8) multiplier *= 0.6;
    else if (vinMatchRate < 0.9) multiplier *= 0.8;

    // Penalize high block rate
    if (blockRate > 0.3) multiplier *= 0.5;
    else if (blockRate > 0.15) multiplier *= 0.75;

    return Math.max(0.3, multiplier);
  }

  /**
   * Should this source be degraded (lower priority)?
   */
  shouldDegrade(stats: SourceHealth): boolean {
    if (stats.totalRequests < 10) return false;

    const failRate = stats.failedCount / stats.totalRequests;
    const blockRate = stats.blockedCount / stats.totalRequests;
    const vinMatchRate = stats.successCount > 0 
      ? stats.vinMatchedCount / stats.successCount 
      : 0;

    // Degrade if:
    // - >45% fail rate
    // - >25% block rate  
    // - <70% VIN match rate (P0 critical)
    return failRate > 0.45 || blockRate > 0.25 || vinMatchRate < 0.7;
  }

  /**
   * Reset stats for a source
   */
  reset(source: string) {
    this.stats.delete(source);
  }

  private getOrCreate(source: string): SourceHealth {
    if (!this.stats.has(source)) {
      this.stats.set(source, {
        source,
        totalRequests: 0,
        successCount: 0,
        vinMatchedCount: 0,
        blockedCount: 0,
        failedCount: 0,
        timeoutCount: 0,
        avgDurationMs: 0,
        avgScore: 0,
        degraded: false,
      });
    }
    return this.stats.get(source)!;
  }

  private nextAvg(current: number, value: number, count: number): number {
    if (count <= 1) return value;
    return Math.round((current * (count - 1) + value) / count);
  }
}
