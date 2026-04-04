/**
 * Competitor Runner Service
 * 
 * Orchestrates parsing across all competitor sources
 * with rate limiting and error handling
 */

import { Injectable, Logger } from '@nestjs/common';
import { CompetitorParserService, ParsedCompetitorData } from './competitor-parser.service';
import { getEnabledSources, CompetitorSource } from './competitor.config';
import { SourceRegistryService } from '../source-registry/source-registry.service';

export interface CompetitorRunResult {
  vin: string;
  results: ParsedCompetitorData[];
  stats: {
    totalSources: number;
    successfulSources: number;
    failedSources: number;
    totalDurationMs: number;
  };
}

@Injectable()
export class CompetitorRunnerService {
  private readonly logger = new Logger(CompetitorRunnerService.name);

  constructor(
    private readonly parser: CompetitorParserService,
    private readonly sourceRegistry: SourceRegistryService,
  ) {}

  /**
   * Run VIN search across all competitor sources
   */
  async run(vin: string, maxConcurrent: number = 3): Promise<CompetitorRunResult> {
    const startTime = Date.now();
    const normalizedVin = vin.trim().toUpperCase();
    const sources = getEnabledSources();
    
    this.logger.log(`[CompetitorRunner] Starting search for ${normalizedVin} across ${sources.length} sources`);

    const results: ParsedCompetitorData[] = [];
    let successCount = 0;
    let failCount = 0;

    // Process sources in batches to respect rate limits
    const batches = this.chunkArray(sources, maxConcurrent);

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(source => this.fetchAndParse(source, normalizedVin))
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const source = batch[i];

        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
          successCount++;
          
          // Record success in registry
          await this.sourceRegistry.recordSuccess(source.name, Date.now() - startTime, {
            resultCount: 1,
            exactMatch: result.value.vin === normalizedVin,
          });
        } else {
          failCount++;
          
          // Record failure in registry
          if (result.status === 'rejected') {
            await this.sourceRegistry.recordFail(source.name);
          } else {
            await this.sourceRegistry.recordEmpty(source.name, Date.now() - startTime);
          }
        }
      }

      // Rate limit between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(1000);
      }
    }

    const totalDuration = Date.now() - startTime;
    
    this.logger.log(
      `[CompetitorRunner] Completed: ${successCount}/${sources.length} sources, ` +
      `${results.length} results, ${totalDuration}ms`
    );

    return {
      vin: normalizedVin,
      results,
      stats: {
        totalSources: sources.length,
        successfulSources: successCount,
        failedSources: failCount,
        totalDurationMs: totalDuration,
      },
    };
  }

  /**
   * Fetch HTML and parse for single source
   */
  private async fetchAndParse(
    source: CompetitorSource,
    vin: string,
  ): Promise<ParsedCompetitorData | null> {
    const startTime = Date.now();
    const url = source.searchUrl(vin);

    try {
      this.logger.debug(`[${source.name}] Fetching ${url}`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        this.logger.warn(`[${source.name}] HTTP ${response.status}`);
        return null;
      }

      const html = await response.text();
      const duration = Date.now() - startTime;

      this.logger.debug(`[${source.name}] Fetched ${html.length} bytes in ${duration}ms`);

      // Parse HTML
      const parsed = await this.parser.parse(html, source, url, vin);

      if (parsed) {
        this.logger.log(
          `[${source.name}] SUCCESS: VIN=${parsed.vin}, price=${parsed.price}, ` +
          `images=${parsed.images.length}, confidence=${parsed.confidence}`
        );
      }

      return parsed;
    } catch (error: any) {
      this.logger.warn(`[${source.name}] Error: ${error.message}`);
      return null;
    }
  }

  /**
   * Run search for specific source only
   */
  async runSingle(sourceName: string, vin: string): Promise<ParsedCompetitorData | null> {
    const sources = getEnabledSources();
    const source = sources.find(s => s.name === sourceName);

    if (!source) {
      this.logger.warn(`Source not found: ${sourceName}`);
      return null;
    }

    return this.fetchAndParse(source, vin.trim().toUpperCase());
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
