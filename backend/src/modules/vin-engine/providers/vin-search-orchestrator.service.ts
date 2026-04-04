/**
 * VIN Search Orchestrator Service
 * 
 * Головний сервіс, що координує пошук через всі провайдери
 * з інтеграцією Source Discovery та Competitor Parsing
 * 
 * Flow:
 * VIN → DB → Aggregators → Competitors (Deep Parse) → Web Search → Merge → Score → Result
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResultMergeService } from './result-merge.service';
import { VinCandidateScoringService } from './vin-candidate-scoring.service';
import {
  VinSearchCandidate,
  VinSearchProvider,
  VinSearchContext,
} from '../interfaces/vin-search-provider.interface';
import { DbVinSearchProvider } from './db.provider';
import { AggregatorSearchProvider } from './aggregator-search.provider';
import { CompetitorSearchProvider } from './competitor-search.provider';
import { VinCacheService } from '../vin-cache.service';
import { ExtractorService } from '../extractor.service';
import { SearchProviderService } from '../search.provider';
import { UrlFilterService, FilteredUrl } from '../url-filter.service';
import { Vehicle } from '../../ingestion/schemas/vehicle.schema';
import { SourceDiscoveryService } from '../../source-discovery/source-discovery.service';
import { CompetitorRunnerService } from '../../competitor-parsing/competitor-runner.service';

export interface VinSearchOrchestratorResult {
  success: boolean;
  vin: string;
  merged: VinSearchCandidate | null;
  candidates: VinSearchCandidate[];
  source: 'database' | 'cache' | 'web_search' | 'not_found';
  searchDurationMs: number;
  message: string;
}

@Injectable()
export class VinSearchOrchestratorService {
  private readonly logger = new Logger(VinSearchOrchestratorService.name);

  constructor(
    @InjectModel(Vehicle.name)
    private readonly vehicleModel: Model<Vehicle>,
    private readonly dbProvider: DbVinSearchProvider,
    private readonly aggregatorProvider: AggregatorSearchProvider,
    private readonly competitorProvider: CompetitorSearchProvider,
    private readonly scoringService: VinCandidateScoringService,
    private readonly resultMergeService: ResultMergeService,
    private readonly vinCache: VinCacheService,
    private readonly extractor: ExtractorService,
    private readonly searchProvider: SearchProviderService,
    private readonly urlFilter: UrlFilterService,
    private readonly sourceDiscovery: SourceDiscoveryService,
    private readonly competitorRunner: CompetitorRunnerService,
  ) {}

  /**
   * Main orchestrated VIN search
   */
  async search(vin: string, skipCache = false): Promise<VinSearchOrchestratorResult> {
    const startTime = Date.now();
    const normalizedVin = this.normalizeVin(vin);

    if (!normalizedVin) {
      return {
        success: false,
        vin: vin,
        merged: null,
        candidates: [],
        source: 'not_found',
        searchDurationMs: Date.now() - startTime,
        message: 'Invalid VIN format (must be 17 characters)',
      };
    }

    const context: VinSearchContext = { vin: normalizedVin, skipCache };
    this.logger.log(`[Orchestrator] Starting search for ${normalizedVin}`);

    // Step 1: Check local database
    const dbCandidates = await this.dbProvider.search(context);
    if (dbCandidates.length > 0) {
      const merged = this.processAndMerge(dbCandidates, normalizedVin);
      this.logger.log(`[Orchestrator] Found in DB: ${normalizedVin}`);
      return {
        success: true,
        vin: normalizedVin,
        merged,
        candidates: dbCandidates,
        source: 'database',
        searchDurationMs: Date.now() - startTime,
        message: 'Знайдено в базі даних',
      };
    }

    // Step 2: Check cache (unless skipCache)
    if (!skipCache) {
      const cached = await this.vinCache.get(normalizedVin);
      if (cached === 'not_found') {
        return {
          success: false,
          vin: normalizedVin,
          merged: null,
          candidates: [],
          source: 'cache',
          searchDurationMs: Date.now() - startTime,
          message: 'Раніше шукали - не знайдено',
        };
      }
      if (cached) {
        const candidate = this.cacheToCandidate(cached, normalizedVin);
        return {
          success: true,
          vin: normalizedVin,
          merged: candidate,
          candidates: [candidate],
          source: 'cache',
          searchDurationMs: Date.now() - startTime,
          message: 'Знайдено в кеші',
        };
      }
    }

    // Step 3: Parallel search from all providers
    this.logger.log(`[Orchestrator] Starting multi-source search for ${normalizedVin}`);
    
    try {
      // Run competitor deep parsing in parallel with other sources
      const [aggregatorCandidates, competitorCandidates, competitorDeepResults] = await Promise.all([
        this.aggregatorProvider.search(context),
        this.competitorProvider.search(context),
        this.competitorRunner.run(normalizedVin, 3), // Deep parsing
      ]);

      // Also do web search
      const webSearchResults = await this.searchProvider.searchVin(normalizedVin);
      const filteredUrls = this.urlFilter.filter(webSearchResults);

      // Source Discovery: discover new sources from web search results
      try {
        const allSearchUrls = webSearchResults.map(r => typeof r === 'string' ? r : r.url).filter(Boolean) as string[];
        await this.sourceDiscovery.discoverFromSearchResults(
          allSearchUrls,
          'web_search',
          normalizedVin,
        );
      } catch (discoveryError: any) {
        this.logger.warn(`Source discovery error: ${discoveryError.message}`);
      }

      // Convert competitor deep results to candidates
      const competitorDeepCandidates: VinSearchCandidate[] = competitorDeepResults.results.map(r => ({
        vin: r.vin || normalizedVin,
        title: r.title ?? undefined,
        price: r.price ?? undefined,
        images: r.images || [],
        saleDate: r.saleDate ?? undefined,
        isAuction: !!(r.lotNumber || r.saleDate),
        lotNumber: r.lotNumber ?? undefined,
        location: r.location ?? undefined,
        mileage: r.mileage?.toString(),
        make: r.make ?? undefined,
        model: r.model ?? undefined,
        year: r.year ?? undefined,
        damageType: r.damageType ?? undefined,
        sourceUrl: r.sourceUrl,
        sourceName: `competitor_${r.sourceName}`,
        confidence: r.confidence,
        raw: r.raw,
      }));

      this.logger.log(
        `[Orchestrator] Competitor deep parsing: ${competitorDeepResults.stats.successfulSources}/${competitorDeepResults.stats.totalSources} sources, ` +
        `${competitorDeepCandidates.length} candidates`
      );

      // Combine all URLs for extraction
      const allUrls: FilteredUrl[] = [
        ...aggregatorCandidates.map(c => ({
          url: c.sourceUrl || '',
          source: c.sourceName,
          priority: 70,
          domain: c.sourceName,
        })).filter(u => u.url),
        ...competitorCandidates.map(c => ({
          url: c.sourceUrl || '',
          source: c.sourceName,
          priority: 60,
          domain: c.sourceName,
        })).filter(u => u.url),
        ...filteredUrls.slice(0, 5),
      ];

      // Limit to top 10 URLs for extraction (deduplicate by url)
      const seenUrls = new Set<string>();
      const uniqueUrls: FilteredUrl[] = [];
      for (const urlObj of allUrls) {
        if (!seenUrls.has(urlObj.url)) {
          seenUrls.add(urlObj.url);
          uniqueUrls.push(urlObj);
        }
        if (uniqueUrls.length >= 10) break;
      }
      this.logger.log(`[Orchestrator] Extracting from ${uniqueUrls.length} URLs`);

      // Extract data from pages
      const extractedData = await this.extractor.extractFromUrls(uniqueUrls, normalizedVin);

      // Convert extracted data to candidates
      const allCandidates: VinSearchCandidate[] = [
        // Add competitor deep parsing results first (higher quality)
        ...competitorDeepCandidates,
        // Then add web extraction results
        ...extractedData.map(data => ({
          vin: data.vin || normalizedVin,
          title: data.title ?? undefined,
          price: data.price ?? undefined,
          images: data.images,
          saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
          isAuction: this.scoringService.classifyAuction({
            vin: data.vin || normalizedVin,
            sourceName: data.source || 'web_search',
            sourceUrl: data.sourceUrl,
            lotNumber: data.lotNumber ?? undefined,
            saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
          }),
          lotNumber: data.lotNumber ?? undefined,
          location: data.location ?? undefined,
          mileage: data.mileage?.toString(),
          make: data.make ?? undefined,
          model: data.model ?? undefined,
          year: data.year ?? undefined,
          damageType: data.damageType ?? undefined,
          sourceUrl: data.sourceUrl,
          sourceName: data.source || 'web_search',
          confidence: 0,
          raw: data,
        })),
      ];

      // Score all candidates
      for (const candidate of allCandidates) {
        candidate.confidence = this.scoringService.score(candidate, normalizedVin);
        candidate.isAuction = this.scoringService.classifyAuction(candidate);
      }

      // Filter to exact VIN matches
      const exactMatches = this.resultMergeService.filterExactMatches(allCandidates, normalizedVin);

      // Source Discovery: analyze extracted sources for quality
      try {
        for (const data of extractedData) {
          if (data.sourceUrl) {
            const domain = this.extractDomainFromUrl(data.sourceUrl);
            if (domain) {
              await this.sourceDiscovery.analyzeSource(domain, normalizedVin, {
                hasVinData: !!(data.vin && data.vin.toUpperCase() === normalizedVin),
                dataQuality: data.vin ? 0.7 : 0.3,
                responseTime: 0, // Not tracked in current flow
                hasImages: !!(data.images && data.images.length > 0),
                hasPrice: !!data.price,
                hasAuctionInfo: !!(data.lotNumber || data.saleDate),
              });
            }
          }
        }
      } catch (analysisError: any) {
        this.logger.warn(`Source analysis error: ${analysisError.message}`);
      }

      if (exactMatches.length === 0) {
        await this.vinCache.set(normalizedVin, null);
        return {
          success: false,
          vin: normalizedVin,
          merged: null,
          candidates: [],
          source: 'not_found',
          searchDurationMs: Date.now() - startTime,
          message: 'Інформацію не знайдено',
        };
      }

      // Merge results
      const merged = this.resultMergeService.mergeCandidates(exactMatches);

      // Cache result
      if (merged) {
        await this.vinCache.set(normalizedVin, this.candidateToCache(merged));
      }

      this.logger.log(`[Orchestrator] SUCCESS: ${normalizedVin} (${exactMatches.length} sources)`);

      return {
        success: true,
        vin: normalizedVin,
        merged,
        candidates: exactMatches.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
        source: 'web_search',
        searchDurationMs: Date.now() - startTime,
        message: `Знайдено через ${exactMatches.length} джерел`,
      };

    } catch (error: any) {
      this.logger.error(`[Orchestrator] Error: ${error.message}`);
      return {
        success: false,
        vin: normalizedVin,
        merged: null,
        candidates: [],
        source: 'not_found',
        searchDurationMs: Date.now() - startTime,
        message: `Помилка пошуку: ${error.message}`,
      };
    }
  }

  private processAndMerge(candidates: VinSearchCandidate[], vin: string): VinSearchCandidate | null {
    for (const c of candidates) {
      c.confidence = this.scoringService.score(c, vin);
      c.isAuction = this.scoringService.classifyAuction(c);
    }
    return this.resultMergeService.mergeCandidates(candidates);
  }

  private normalizeVin(vin: string): string | null {
    if (!vin) return null;
    const cleaned = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (cleaned.length !== 17) return null;
    return cleaned;
  }

  private cacheToCandidate(cached: any, vin: string): VinSearchCandidate {
    return {
      vin,
      title: cached.title,
      price: cached.price,
      images: cached.images,
      saleDate: cached.saleDate,
      isAuction: cached.isAuction ?? true,
      lotNumber: cached.lotNumber,
      location: cached.location,
      mileage: cached.mileage,
      make: cached.make,
      model: cached.model,
      year: cached.year,
      damageType: cached.damageType,
      sourceUrl: cached.sourceUrls?.[0],
      sourceName: 'cache',
      confidence: cached.dataQuality ?? 0.7,
      raw: cached,
    };
  }

  private candidateToCache(candidate: VinSearchCandidate): any {
    return {
      vin: candidate.vin,
      title: candidate.title,
      price: candidate.price,
      images: candidate.images,
      saleDate: candidate.saleDate,
      isAuction: candidate.isAuction,
      lotNumber: candidate.lotNumber,
      location: candidate.location,
      mileage: candidate.mileage,
      make: candidate.make,
      model: candidate.model,
      year: candidate.year,
      damageType: candidate.damageType,
      sourceUrls: candidate.sourceUrl ? [candidate.sourceUrl] : [],
      sources: candidate.raw?.allSources || [candidate.sourceName],
      dataQuality: candidate.confidence,
    };
  }

  private extractDomainFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }
}
