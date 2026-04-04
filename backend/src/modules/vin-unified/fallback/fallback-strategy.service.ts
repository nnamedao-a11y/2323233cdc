/**
 * Smart Fallback Strategy Service
 * 
 * Determines WHEN and HOW to activate fallback based on:
 * - Core source health (Copart success rate, latency, block rate)
 * - System load
 * 
 * Modes:
 * - disabled: Core is excellent, no fallback needed
 * - delayed: Core is OK, start fallback after delay
 * - parallel: Core is degraded, start fallback immediately
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceHealthTracker } from '../anti-block/source-health-tracker';
import { FallbackMode } from '../dto/vin.dto';

export interface FallbackStrategy {
  mode: FallbackMode;
  delayMs: number;
}

@Injectable()
export class FallbackStrategyService {
  private readonly logger = new Logger(FallbackStrategyService.name);

  constructor(private readonly healthTracker: SourceHealthTracker) {}

  /**
   * Calculate optimal fallback strategy based on live Copart/IAAI metrics
   */
  getStrategy(): FallbackStrategy {
    const copart = this.healthTracker.get('Copart');
    const iaai = this.healthTracker.get('IAAI');

    // Not enough data yet — use conservative delayed mode
    if (!copart || copart.totalRequests < 5) {
      this.logger.debug('[FallbackStrategy] Not enough Copart data, using delayed mode');
      return { mode: 'delayed', delayMs: 8000 };
    }

    const successRate = copart.successCount / copart.totalRequests;
    const blockRate = copart.blockedCount / copart.totalRequests;
    const latency = copart.avgDurationMs || 12000;

    // Also check IAAI
    const iaaiSuccessRate = iaai && iaai.totalRequests >= 5
      ? iaai.successCount / iaai.totalRequests
      : 0.5;

    // Combined core success rate
    const combinedSuccess = (successRate + iaaiSuccessRate) / 2;

    let strategy: FallbackStrategy;

    if (combinedSuccess < 0.4 || blockRate > 0.4) {
      // CORE is dying → fallback immediately (parallel)
      strategy = { mode: 'parallel', delayMs: 0 };
      this.logger.warn(
        `[FallbackStrategy] PARALLEL mode: Copart success=${(successRate * 100).toFixed(0)}%, ` +
        `block=${(blockRate * 100).toFixed(0)}%`
      );
    } else if (successRate < 0.7 || latency > 18000) {
      // CORE is degrading → fallback earlier
      strategy = { mode: 'delayed', delayMs: 3000 };
      this.logger.log(
        `[FallbackStrategy] EARLY DELAYED mode (3s): Copart success=${(successRate * 100).toFixed(0)}%, ` +
        `latency=${latency}ms`
      );
    } else if (successRate > 0.9 && latency < 10000 && blockRate < 0.05) {
      // CORE is excellent → fallback almost never needed
      strategy = { mode: 'delayed', delayMs: Math.min(15000, Math.floor(latency * 1.2)) };
      this.logger.debug(
        `[FallbackStrategy] LATE DELAYED mode: Copart excellent, delay=${strategy.delayMs}ms`
      );
    } else {
      // Normal case → adaptive delay based on Copart latency
      const delay = Math.max(3000, Math.min(10000, Math.floor(latency * 0.8)));
      strategy = { mode: 'delayed', delayMs: delay };
      this.logger.log(
        `[FallbackStrategy] NORMAL DELAYED mode (${delay}ms): Copart success=${(successRate * 100).toFixed(0)}%`
      );
    }

    return strategy;
  }
}
