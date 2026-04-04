/**
 * VIN Orchestrator Service
 * 
 * Головний координатор пошуку VIN через всі джерела
 * 
 * Flow:
 * VIN → registry → adapters → merge → confidence → vehicle truth
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceService } from '../sources/source.service';
import { AdapterRegistry } from '../adapters/adapter.registry';
import { TruthMergeService } from '../merge/truth-merge.service';
import { QualityLayerService } from '../validation/quality-layer.service';
import { NormalizedVehicle, SourceConfig, SearchResult } from '../adapters/interfaces/vin-source-adapter.interface';
import { MergedVehicleDto } from '../dto/normalized-vehicle.dto';
import { isValidVin, cleanVin } from '../utils/vin.utils';
import { MeshSource } from '../sources/source.schema';

export interface OrchestratorResult {
  success: boolean;
  vin: string;
  merged: MergedVehicleDto | null;
  candidates: NormalizedVehicle[];
  validatedCandidates: number;
  rejectedCandidates: number;
  sourcesUsed: number;
  sourcesSuccessful: number;
  searchDurationMs: number;
  message: string;
  sourceBreakdown: {
    source: string;
    status: 'success' | 'empty' | 'error' | 'rejected';
    latencyMs: number;
    resultCount: number;
  }[];
}

@Injectable()
export class VinOrchestratorService {
  private readonly logger = new Logger(VinOrchestratorService.name);

  constructor(
    private readonly sourceService: SourceService,
    private readonly adapterRegistry: AdapterRegistry,
    private readonly mergeService: TruthMergeService,
    private readonly qualityService: QualityLayerService,
  ) {}

  /**
   * Main orchestrated VIN search across all active sources
   */
  async search(vin: string, options?: {
    maxSources?: number;
    timeout?: number;
    includeDisabled?: boolean;
  }): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const cleanedVin = cleanVin(vin);

    // Validate VIN
    if (!isValidVin(cleanedVin)) {
      return {
        success: false,
        vin: vin,
        merged: null,
        candidates: [],
        validatedCandidates: 0,
        rejectedCandidates: 0,
        sourcesUsed: 0,
        sourcesSuccessful: 0,
        searchDurationMs: Date.now() - startTime,
        message: 'Invalid VIN format (must be 17 characters)',
        sourceBreakdown: [],
      };
    }

    this.logger.log(`[Orchestrator] Starting search for ${cleanedVin}`);

    // Get active sources sorted by priority
    const sources = options?.includeDisabled
      ? await this.sourceService.getAll()
      : await this.sourceService.getActiveSources();

    const maxSources = options?.maxSources || 15;
    const sourcesToUse = sources.slice(0, maxSources);

    this.logger.debug(`[Orchestrator] Using ${sourcesToUse.length} sources`);

    // Search through sources in parallel batches
    const allCandidates: NormalizedVehicle[] = [];
    const sourceBreakdown: OrchestratorResult['sourceBreakdown'] = [];

    // Process in batches of 3 to respect rate limits
    const batchSize = 3;
    for (let i = 0; i < sourcesToUse.length; i += batchSize) {
      const batch = sourcesToUse.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(source => this.searchSource(cleanedVin, source))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const source = batch[j];
        const sourceStart = Date.now();

        if (result.status === 'fulfilled') {
          const { candidates, latencyMs } = result.value;
          
          allCandidates.push(...candidates);
          
          sourceBreakdown.push({
            source: source.name,
            status: candidates.length > 0 ? 'success' : 'empty',
            latencyMs,
            resultCount: candidates.length,
          });

          // Record stats
          if (candidates.length > 0) {
            const hasExactMatch = candidates.some(c => cleanVin(c.vin) === cleanedVin);
            await this.sourceService.recordSuccess(source.name, latencyMs, hasExactMatch);
          } else {
            await this.sourceService.recordEmpty(source.name, latencyMs);
          }
        } else {
          sourceBreakdown.push({
            source: source.name,
            status: 'error',
            latencyMs: Date.now() - sourceStart,
            resultCount: 0,
          });

          await this.sourceService.recordFailure(source.name);
        }
      }

      // Small delay between batches
      if (i + batchSize < sourcesToUse.length) {
        await this.delay(200);
      }
    }

    // Quality Layer: Validate and filter candidates
    const validatedCandidates = await this.qualityService.validateBatch(allCandidates, cleanedVin);
    const rejectedCount = allCandidates.length - validatedCandidates.length;

    this.logger.debug(
      `[QualityLayer] Validated: ${validatedCandidates.length}/${allCandidates.length} ` +
      `(rejected: ${rejectedCount})`
    );

    // Merge validated results
    const merged = await this.mergeService.merge(validatedCandidates, cleanedVin);

    const successfulSources = sourceBreakdown.filter(s => s.status === 'success').length;
    const totalDuration = Date.now() - startTime;

    this.logger.log(
      `[Orchestrator] Completed: ${successfulSources}/${sourcesToUse.length} sources, ` +
      `${validatedCandidates.length} validated candidates, ${totalDuration}ms`
    );

    return {
      success: merged !== null,
      vin: cleanedVin,
      merged,
      candidates: validatedCandidates,
      validatedCandidates: validatedCandidates.length,
      rejectedCandidates: rejectedCount,
      sourcesUsed: sourcesToUse.length,
      sourcesSuccessful: successfulSources,
      searchDurationMs: totalDuration,
      message: merged
        ? `Found data from ${successfulSources} sources (${validatedCandidates.length} validated)`
        : 'No data found',
      sourceBreakdown,
    };
  }

  /**
   * Search a single source
   */
  async searchSingleSource(vin: string, sourceName: string): Promise<{
    success: boolean;
    candidates: NormalizedVehicle[];
    latencyMs: number;
    message: string;
  }> {
    const cleanedVin = cleanVin(vin);
    if (!isValidVin(cleanedVin)) {
      return {
        success: false,
        candidates: [],
        latencyMs: 0,
        message: 'Invalid VIN',
      };
    }

    const source = await this.sourceService.getByName(sourceName);
    if (!source) {
      return {
        success: false,
        candidates: [],
        latencyMs: 0,
        message: `Source not found: ${sourceName}`,
      };
    }

    const result = await this.searchSource(cleanedVin, source);
    
    return {
      success: result.candidates.length > 0,
      candidates: result.candidates,
      latencyMs: result.latencyMs,
      message: result.candidates.length > 0
        ? `Found ${result.candidates.length} results`
        : 'No results',
    };
  }

  /**
   * Test a VIN against all adapters (for debugging)
   */
  async testAllAdapters(vin: string): Promise<{
    vin: string;
    results: { adapter: string; success: boolean; resultCount: number; latencyMs: number }[];
  }> {
    const cleanedVin = cleanVin(vin);
    const adapters = this.adapterRegistry.getAll();
    const results: any[] = [];

    for (const adapter of adapters) {
      const startTime = Date.now();
      
      // Create minimal source config for testing
      const testConfig: SourceConfig = {
        id: 'test',
        name: `test_${adapter.kind}`,
        domain: 'test.com',
        parserKind: adapter.kind as any,
        type: 'aggregator',
        enabled: true,
        priority: 1,
        trustScore: 0.5,
        vinHitRate: 0,
        dataCompleteness: 0,
        freshnessScore: 0.5,
        avgLatency: 0,
        requestConfig: {},
        selectorConfig: {},
        sampleVins: [cleanedVin],
        quarantine: false,
        status: 'testing',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      };

      try {
        const searchResults = adapter.search
          ? await adapter.search(cleanedVin, testConfig)
          : [];
        
        results.push({
          adapter: adapter.kind,
          success: searchResults.length > 0,
          resultCount: searchResults.length,
          latencyMs: Date.now() - startTime,
        });
      } catch (error: any) {
        results.push({
          adapter: adapter.kind,
          success: false,
          resultCount: 0,
          latencyMs: Date.now() - startTime,
          error: error.message,
        });
      }
    }

    return { vin: cleanedVin, results };
  }

  // ========== PRIVATE ==========

  private async searchSource(
    vin: string,
    source: MeshSource,
  ): Promise<{ candidates: NormalizedVehicle[]; latencyMs: number }> {
    const startTime = Date.now();
    const adapter = this.adapterRegistry.get(source.parserKind);

    if (!adapter) {
      this.logger.warn(`[${source.name}] No adapter for kind: ${source.parserKind}`);
      return { candidates: [], latencyMs: Date.now() - startTime };
    }

    try {
      const sourceConfig = this.toSourceConfig(source);
      
      // Search
      const searchResults = adapter.search
        ? await adapter.search(vin, sourceConfig)
        : [];

      if (searchResults.length === 0) {
        return { candidates: [], latencyMs: Date.now() - startTime };
      }

      // Extract from each result
      const candidates: NormalizedVehicle[] = [];
      
      for (const result of searchResults.slice(0, 5)) { // Limit per source
        try {
          const vehicle = await adapter.extract(result, sourceConfig);
          if (vehicle && vehicle.vin) {
            candidates.push(vehicle);
          }
        } catch (error: any) {
          this.logger.warn(`[${source.name}] Extract error: ${error.message}`);
        }
      }

      const latencyMs = Date.now() - startTime;
      
      this.logger.debug(
        `[${source.name}] Found ${candidates.length} candidates in ${latencyMs}ms`
      );

      return { candidates, latencyMs };
    } catch (error: any) {
      this.logger.warn(`[${source.name}] Search error: ${error.message}`);
      return { candidates: [], latencyMs: Date.now() - startTime };
    }
  }

  private toSourceConfig(source: MeshSource): SourceConfig {
    return {
      id: (source as any)._id?.toString() || source.name,
      name: source.name,
      domain: source.domain,
      parserKind: source.parserKind as any,
      type: source.type as any,
      enabled: source.enabled,
      priority: source.priority,
      trustScore: source.trustScore,
      vinHitRate: source.vinHitRate,
      dataCompleteness: source.dataCompleteness,
      freshnessScore: source.freshnessScore,
      avgLatency: source.avgLatency,
      requestConfig: source.requestConfig || {},
      selectorConfig: source.selectorConfig || {},
      sampleVins: source.sampleVins || [],
      lastSuccessAt: source.lastSuccessAt,
      lastFailureAt: source.lastFailureAt,
      cooldownUntil: source.cooldownUntil,
      quarantine: source.quarantine,
      quarantineReason: source.quarantineReason,
      status: source.status as any,
      consecutiveFailures: source.consecutiveFailures,
      consecutiveSuccesses: source.consecutiveSuccesses,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
