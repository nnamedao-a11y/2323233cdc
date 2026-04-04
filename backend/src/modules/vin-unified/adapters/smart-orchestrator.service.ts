/**
 * Smart Orchestrator Service v2
 * 
 * SIMPLE 2-SOURCE STRATEGY:
 * - Tier 1: Copart (primary) - starts immediately
 * - Tier 2: IAAI (fallback) - starts after adaptive delay
 * 
 * Features:
 * - Early return on strong result
 * - Health-aware adaptive delays
 * - Source degradation (skip unhealthy sources)
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceHealthTracker } from '../anti-block/source-health-tracker';
import { DynamicWeightEngine } from '../anti-block/dynamic-weight.engine';
import { HealthAwareTierFactory, SourceTierConfig } from '../anti-block/health-aware-tier.factory';
import { ExtractedVehicle, DiscoveredSource, SourceMetadataDto } from '../dto/vin.dto';
import { AdapterRegistry } from './adapter.registry';

export interface OrchestratorResult {
  vehicles: ExtractedVehicle[];
  metadata: SourceMetadataDto[];
  winner: ExtractedVehicle | null;
  winnerSource: string | null;
  earlyReturn: boolean;
  totalDurationMs: number;
  strategy: string;
}

@Injectable()
export class SmartOrchestratorService {
  private readonly logger = new Logger(SmartOrchestratorService.name);

  constructor(
    private readonly adapters: AdapterRegistry,
    private readonly healthTracker: SourceHealthTracker,
    private readonly weightEngine: DynamicWeightEngine,
    private readonly tierFactory: HealthAwareTierFactory,
  ) {}

  /**
   * Run orchestrated extraction with health-aware tiered delays
   */
  async run(
    vin: string,
    tiers: SourceTierConfig[],
    options: {
      timeoutMs?: number;
      enableEarlyReturn?: boolean;
    } = {}
  ): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 60000;
    const enableEarlyReturn = options.enableEarlyReturn !== false;

    const vehicles: ExtractedVehicle[] = [];
    const metadata: SourceMetadataDto[] = [];
    let winner: ExtractedVehicle | null = null;
    let winnerSource: string | null = null;
    let resolved = false;

    const normalizedVin = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const activeTasks: Promise<void>[] = [];
    const completedSources = new Set<string>();

    // Get system status for strategy
    const systemStatus = this.tierFactory.getSystemStatus();

    this.logger.log(
      `[Orchestrator] Starting VIN=${vin}, tiers=${tiers.length}, ` +
      `strategy=${systemStatus.recommendedStrategy}, earlyReturn=${enableEarlyReturn}`
    );

    return new Promise(async (resolve) => {
      // Global timeout
      const globalTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.logger.warn(`[Orchestrator] Global timeout (${timeoutMs}ms)`);
          resolve(this.buildResult(vehicles, metadata, winner, winnerSource, false, startTime, systemStatus.recommendedStrategy));
        }
      }, timeoutMs);

      // Process each tier
      for (const tier of tiers) {
        if (resolved) break;

        // Wait for tier delay
        if (tier.startAfterMs > 0) {
          await this.sleep(tier.startAfterMs);
          if (resolved) break;
        }

        this.logger.log(
          `[Orchestrator] Starting tier: ${tier.tierName} (${tier.sources.length} sources)`
        );

        // Start all sources in this tier
        for (const source of tier.sources) {
          if (resolved) break;

          // Skip degraded sources
          if (this.healthTracker.get(source.name)?.degraded) {
            this.logger.debug(`[Orchestrator] Skipping degraded source: ${source.name}`);
            metadata.push({
              name: source.name,
              type: source.type,
              tier: source.tier,
              success: false,
              responseTime: 0,
              errorReason: 'Source degraded - skipped',
            });
            continue;
          }

          const adapter = this.adapters.get(source.type);
          if (!adapter) continue;

          const sourceStartTime = Date.now();

          const task = adapter.extract(vin, source)
            .then((vehicle) => {
              const responseTime = Date.now() - sourceStartTime;
              completedSources.add(source.name);

              if (vehicle) {
                vehicle.responseTime = responseTime;
                vehicles.push(vehicle);

                // Check for early return
                const vinMatched = this.checkVinMatch(vehicle.vin, normalizedVin);
                const isStrong = enableEarlyReturn && 
                  this.isStrongResult(vehicle, source.name, vinMatched);

                // Track health
                this.healthTracker.recordSuccess(
                  source.name, 
                  responseTime, 
                  vinMatched, 
                  vehicle.confidence
                );

                metadata.push({
                  name: source.name,
                  type: source.type,
                  tier: source.tier,
                  success: true,
                  responseTime,
                });

                if (isStrong && !resolved) {
                  resolved = true;
                  winner = vehicle;
                  winnerSource = source.name;
                  clearTimeout(globalTimeout);
                  
                  this.logger.log(
                    `[Orchestrator] 🚀 EARLY RETURN from ${source.name} ` +
                    `(score: ${vehicle.confidence?.toFixed(2)}, VIN match: ${vinMatched})`
                  );

                  resolve(this.buildResult(vehicles, metadata, winner, winnerSource, true, startTime, systemStatus.recommendedStrategy));
                }
              } else {
                this.healthTracker.recordFailure(source.name, 'No data returned');
                metadata.push({
                  name: source.name,
                  type: source.type,
                  tier: source.tier,
                  success: false,
                  responseTime,
                });
              }
            })
            .catch((error) => {
              const responseTime = Date.now() - sourceStartTime;
              completedSources.add(source.name);

              const isBlocked = error.message?.toLowerCase().includes('cloudflare') ||
                error.message?.toLowerCase().includes('captcha');

              if (isBlocked) {
                this.healthTracker.recordBlocked(source.name, error.message);
              } else {
                this.healthTracker.recordFailure(source.name, error.message);
              }

              metadata.push({
                name: source.name,
                type: source.type,
                tier: source.tier,
                success: false,
                responseTime,
                errorReason: error.message,
              });
            });

          activeTasks.push(task);
        }
      }

      // Wait for all tasks to complete
      await Promise.allSettled(activeTasks);

      if (!resolved) {
        resolved = true;
        clearTimeout(globalTimeout);

        // Pick best result
        if (!winner) {
          const best = this.pickBestResult(vehicles, normalizedVin);
          if (best) {
            winner = best;
            winnerSource = best.source;
          }
        }

        resolve(this.buildResult(vehicles, metadata, winner, winnerSource, false, startTime, systemStatus.recommendedStrategy));
      }
    });
  }

  /**
   * Build tier configuration using Health-Aware Factory
   */
  buildAdaptiveTiers(sources: DiscoveredSource[]): SourceTierConfig[] {
    return this.tierFactory.buildAdaptiveTiers(sources);
  }

  /**
   * Check if result is strong enough for early return
   */
  private isStrongResult(
    vehicle: ExtractedVehicle,
    sourceName: string,
    vinMatched: boolean
  ): boolean {
    // Must have VIN match (P0)
    if (!vinMatched) return false;

    // LocalDecoder doesn't count for early return
    if (sourceName === 'LocalDecoder') return false;

    // Get dynamic threshold
    const threshold = this.weightEngine.getEarlyReturnThreshold(sourceName);

    // Calculate effective score
    let score = vehicle.confidence || 0;

    // Bonus for auction data
    if (vehicle.lotNumber) score += 0.15;
    if (vehicle.price && vehicle.price > 0) score += 0.1;
    if (vehicle.images && vehicle.images.length > 0) score += 0.05;

    return score >= threshold;
  }

  /**
   * Pick best result from collected vehicles
   */
  private pickBestResult(
    vehicles: ExtractedVehicle[],
    normalizedVin: string
  ): ExtractedVehicle | null {
    const valid = vehicles.filter(v => {
      const vVin = (v.vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
      return vVin === normalizedVin && v.source !== 'LocalDecoder';
    });

    if (valid.length === 0) {
      // Fallback to LocalDecoder
      return vehicles.find(v => v.source === 'LocalDecoder') || null;
    }

    // Sort by confidence
    valid.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    return valid[0];
  }

  /**
   * Check VIN match
   */
  private checkVinMatch(extractedVin: string | undefined, normalizedInput: string): boolean {
    if (!extractedVin) return false;
    const normalized = extractedVin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    return normalized === normalizedInput && normalized.length === 17;
  }

  /**
   * Build result object
   */
  private buildResult(
    vehicles: ExtractedVehicle[],
    metadata: SourceMetadataDto[],
    winner: ExtractedVehicle | null,
    winnerSource: string | null,
    earlyReturn: boolean,
    startTime: number,
    strategy: string = 'primary-fallback'
  ): OrchestratorResult {
    return {
      vehicles,
      metadata,
      winner,
      winnerSource,
      earlyReturn,
      totalDurationMs: Date.now() - startTime,
      strategy,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
