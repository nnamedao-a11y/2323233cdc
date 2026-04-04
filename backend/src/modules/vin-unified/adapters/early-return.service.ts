/**
 * Early Return Strategy
 * 
 * Returns result as soon as FIRST valid strong source responds
 * instead of waiting for all sources.
 * 
 * Conditions for early return:
 * - vinMatched === true
 * - success === true
 * - totalScore >= threshold (0.75 default)
 * - source !== 'LocalDecoder'
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExtractedVehicle, DiscoveredSource, SourceMetadataDto } from '../dto/vin.dto';
import { AdapterRegistry } from './adapter.registry';

export interface EarlyReturnResult {
  winner: ExtractedVehicle | null;
  allResults: ExtractedVehicle[];
  metadata: SourceMetadataDto[];
  earlyReturn: boolean;
  durationMs: number;
}

interface ScrapeTask {
  source: DiscoveredSource;
  promise: Promise<ExtractedVehicle | null>;
  startTime: number;
}

@Injectable()
export class EarlyReturnService {
  private readonly logger = new Logger(EarlyReturnService.name);

  constructor(private readonly adapters: AdapterRegistry) {}

  /**
   * Run scraping with early return on first strong result
   */
  async resolveWithEarlyReturn(
    vin: string,
    sources: DiscoveredSource[],
    options: {
      threshold?: number;
      timeoutMs?: number;
      maxConcurrency?: number;
    } = {}
  ): Promise<EarlyReturnResult> {
    const startTime = Date.now();
    const threshold = options.threshold ?? 0.75;
    const timeoutMs = options.timeoutMs ?? 60000;
    const maxConcurrency = options.maxConcurrency ?? 4;

    const allResults: ExtractedVehicle[] = [];
    const metadata: SourceMetadataDto[] = [];
    let winner: ExtractedVehicle | null = null;
    let resolved = false;

    // Sort sources by tier (Tier 1 first)
    const sortedSources = [...sources].sort((a, b) => a.tier - b.tier);

    this.logger.log(
      `[EarlyReturn] Starting with ${sortedSources.length} sources, threshold=${threshold}`
    );

    return new Promise(async (resolve) => {
      const activeTasks: ScrapeTask[] = [];
      let sourceIndex = 0;

      // Global timeout
      const globalTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.logger.warn(`[EarlyReturn] Global timeout (${timeoutMs}ms), returning best result`);
          resolve({
            winner: this.findBestResult(allResults, vin, threshold),
            allResults,
            metadata,
            earlyReturn: false,
            durationMs: Date.now() - startTime,
          });
        }
      }, timeoutMs);

      // Process sources with concurrency limit
      const processNext = async () => {
        while (
          !resolved &&
          sourceIndex < sortedSources.length &&
          activeTasks.length < maxConcurrency
        ) {
          const source = sortedSources[sourceIndex++];
          const adapter = this.adapters.get(source.type);

          if (!adapter) {
            metadata.push({
              name: source.name,
              type: source.type,
              tier: source.tier,
              success: false,
              responseTime: 0,
              errorReason: `No adapter for type: ${source.type}`,
            });
            continue;
          }

          const taskStartTime = Date.now();

          const task: ScrapeTask = {
            source,
            startTime: taskStartTime,
            promise: this.runWithTimeout(
              adapter.extract(vin, source),
              Math.min(30000, timeoutMs - (Date.now() - startTime))
            ).then(async (result) => {
              const responseTime = Date.now() - taskStartTime;

              if (result) {
                result.responseTime = responseTime;
                allResults.push(result);

                // Check if this is a strong result for early return
                const isStrong = this.isStrongResult(result, vin, threshold);

                metadata.push({
                  name: source.name,
                  type: source.type,
                  tier: source.tier,
                  success: true,
                  responseTime,
                });

                if (isStrong && !resolved) {
                  resolved = true;
                  clearTimeout(globalTimeout);
                  
                  this.logger.log(
                    `[EarlyReturn] 🚀 Strong result from ${source.name} after ${responseTime}ms (score: ${result.confidence?.toFixed(2)})`
                  );

                  resolve({
                    winner: result,
                    allResults,
                    metadata,
                    earlyReturn: true,
                    durationMs: Date.now() - startTime,
                  });
                }
              } else {
                metadata.push({
                  name: source.name,
                  type: source.type,
                  tier: source.tier,
                  success: false,
                  responseTime,
                });
              }

              // Remove from active and process next
              const idx = activeTasks.findIndex((t) => t.source.name === source.name);
              if (idx >= 0) activeTasks.splice(idx, 1);
              
              if (!resolved) {
                processNext();
              }

              return result;
            }).catch((error) => {
              const responseTime = Date.now() - taskStartTime;
              
              metadata.push({
                name: source.name,
                type: source.type,
                tier: source.tier,
                success: false,
                responseTime,
                errorReason: error.message,
              });

              const idx = activeTasks.findIndex((t) => t.source.name === source.name);
              if (idx >= 0) activeTasks.splice(idx, 1);

              if (!resolved) {
                processNext();
              }

              return null;
            }),
          };

          activeTasks.push(task);
        }

        // Check if all done
        if (
          !resolved &&
          sourceIndex >= sortedSources.length &&
          activeTasks.length === 0
        ) {
          resolved = true;
          clearTimeout(globalTimeout);

          const bestResult = this.findBestResult(allResults, vin, threshold);
          
          this.logger.log(
            `[EarlyReturn] All sources completed. Winner: ${bestResult?.source || 'none'}`
          );

          resolve({
            winner: bestResult,
            allResults,
            metadata,
            earlyReturn: false,
            durationMs: Date.now() - startTime,
          });
        }
      };

      // Start processing
      processNext();
    });
  }

  /**
   * Check if result qualifies for early return
   */
  private isStrongResult(
    result: ExtractedVehicle,
    inputVin: string,
    threshold: number
  ): boolean {
    // Must have VIN match
    const normalizedInput = inputVin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const normalizedResult = (result.vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const vinMatched = normalizedInput === normalizedResult && normalizedInput.length === 17;

    if (!vinMatched) return false;

    // Must not be LocalDecoder (need auction data)
    if (result.source === 'LocalDecoder') return false;

    // Calculate score
    let score = result.confidence || 0;

    // Bonus for auction data
    if (result.lotNumber) score += 0.15;
    if (result.price && result.price > 0) score += 0.1;
    if (result.images && result.images.length > 0) score += 0.05;

    // Dynamic threshold based on source
    const sourceThreshold = this.getSourceThreshold(result.source, threshold);

    return score >= sourceThreshold;
  }

  /**
   * Get dynamic threshold based on source trust
   */
  private getSourceThreshold(source: string, baseThreshold: number): number {
    // Trusted sources get lower threshold (return faster)
    const trustAdjustments: Record<string, number> = {
      'Copart': -0.1,      // More trusted
      'IAAI': -0.05,
      'AutoBidMaster': 0,
      'BidFax': 0.05,
      'Poctra': 0.05,
    };

    return baseThreshold + (trustAdjustments[source] || 0);
  }

  /**
   * Find best result from all collected
   */
  private findBestResult(
    results: ExtractedVehicle[],
    inputVin: string,
    threshold: number
  ): ExtractedVehicle | null {
    const normalizedInput = inputVin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');

    // Filter to VIN-matched only
    const validResults = results.filter((r) => {
      const normalizedResult = (r.vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
      return normalizedInput === normalizedResult && r.source !== 'LocalDecoder';
    });

    if (validResults.length === 0) {
      // Fallback to LocalDecoder if available
      return results.find((r) => r.source === 'LocalDecoder') || null;
    }

    // Sort by confidence
    validResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    return validResults[0];
  }

  /**
   * Run promise with timeout
   */
  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T | null> {
    return Promise.race([
      promise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs)
      ),
    ]);
  }
}
