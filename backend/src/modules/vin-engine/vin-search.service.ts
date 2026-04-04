/**
 * VIN Search Service - MAIN ENGINE
 * 
 * Flow:
 * 1. Check DB for existing vehicle
 * 2. Check cache
 * 3. Search web for VIN
 * 4. Filter URLs
 * 5. Extract data from pages
 * 6. Merge results
 * 7. Save to DB and cache
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle } from '../ingestion/schemas/vehicle.schema';
import { SearchProviderService } from './search.provider';
import { UrlFilterService } from './url-filter.service';
import { ExtractorService } from './extractor.service';
import { VinMergeService, MergedVinData } from './vin-merge.service';
import { VinCacheService } from './vin-cache.service';
import { PipelineService } from '../pipeline/pipeline.service';

export interface VinSearchResult {
  success: boolean;
  vin: string;
  source: 'database' | 'cache' | 'web_search' | 'not_found';
  vehicle: any | null;
  searchDurationMs: number;
  message: string;
}

@Injectable()
export class VinSearchService {
  private readonly logger = new Logger(VinSearchService.name);

  constructor(
    @InjectModel(Vehicle.name)
    private vehicleModel: Model<Vehicle>,
    private searchProvider: SearchProviderService,
    private urlFilter: UrlFilterService,
    private extractor: ExtractorService,
    private vinMerge: VinMergeService,
    private vinCache: VinCacheService,
    private pipelineService: PipelineService,
  ) {}

  /**
   * Main VIN search method
   * Returns vehicle data from DB, cache, or web search
   */
  async search(vin: string): Promise<VinSearchResult> {
    const startTime = Date.now();
    const normalizedVin = this.normalizeVin(vin);

    if (!normalizedVin) {
      return {
        success: false,
        vin: vin,
        source: 'not_found',
        vehicle: null,
        searchDurationMs: Date.now() - startTime,
        message: 'Invalid VIN format',
      };
    }

    this.logger.log(`[VIN Search] Starting search for ${normalizedVin}`);

    // Step 1: Check database
    const existingVehicle = await this.vehicleModel.findOne({
      vin: normalizedVin,
      isDeleted: { $ne: true },
    });

    if (existingVehicle) {
      this.logger.log(`[VIN Search] Found in DB: ${normalizedVin}`);
      return {
        success: true,
        vin: normalizedVin,
        source: 'database',
        vehicle: existingVehicle,
        searchDurationMs: Date.now() - startTime,
        message: 'Found in database',
      };
    }

    // Step 2: Check cache
    const cached = await this.vinCache.get(normalizedVin);
    
    if (cached === 'not_found') {
      this.logger.log(`[VIN Search] Cache indicates not found: ${normalizedVin}`);
      return {
        success: false,
        vin: normalizedVin,
        source: 'cache',
        vehicle: null,
        searchDurationMs: Date.now() - startTime,
        message: 'Previously searched, not found',
      };
    }

    if (cached) {
      // Save cached data to DB via pipeline
      await this.saveToDatabase(cached);
      
      const savedVehicle = await this.vehicleModel.findOne({ vin: normalizedVin });
      
      return {
        success: true,
        vin: normalizedVin,
        source: 'cache',
        vehicle: savedVehicle || cached,
        searchDurationMs: Date.now() - startTime,
        message: 'Found in cache',
      };
    }

    // Step 3-6: Web search
    this.logger.log(`[VIN Search] Starting web search for ${normalizedVin}`);

    try {
      // Search
      const searchResults = await this.searchProvider.searchVin(normalizedVin);
      
      if (searchResults.length === 0) {
        await this.vinCache.set(normalizedVin, null);
        return {
          success: false,
          vin: normalizedVin,
          source: 'not_found',
          vehicle: null,
          searchDurationMs: Date.now() - startTime,
          message: 'No search results found',
        };
      }

      // Filter URLs
      const filteredUrls = this.urlFilter.filter(searchResults);
      this.logger.log(`[VIN Search] Found ${filteredUrls.length} relevant URLs`);

      if (filteredUrls.length === 0) {
        await this.vinCache.set(normalizedVin, null);
        return {
          success: false,
          vin: normalizedVin,
          source: 'not_found',
          vehicle: null,
          searchDurationMs: Date.now() - startTime,
          message: 'No relevant pages found',
        };
      }

      // Extract data from top URLs (limit to 10)
      const extractedData = await this.extractor.extractFromUrls(
        filteredUrls.slice(0, 10),
        normalizedVin
      );

      if (extractedData.length === 0) {
        await this.vinCache.set(normalizedVin, null);
        return {
          success: false,
          vin: normalizedVin,
          source: 'not_found',
          vehicle: null,
          searchDurationMs: Date.now() - startTime,
          message: 'Could not extract data from pages',
        };
      }

      // Merge results
      const merged = this.vinMerge.merge(extractedData, normalizedVin);

      if (!merged) {
        await this.vinCache.set(normalizedVin, null);
        return {
          success: false,
          vin: normalizedVin,
          source: 'not_found',
          vehicle: null,
          searchDurationMs: Date.now() - startTime,
          message: 'Could not merge extracted data',
        };
      }

      // Save to cache
      await this.vinCache.set(normalizedVin, merged);

      // Save to database via pipeline
      await this.saveToDatabase(merged);

      const savedVehicle = await this.vehicleModel.findOne({ vin: normalizedVin });

      this.logger.log(`[VIN Search] SUCCESS: ${normalizedVin} (quality: ${merged.dataQuality})`);

      return {
        success: true,
        vin: normalizedVin,
        source: 'web_search',
        vehicle: savedVehicle || merged,
        searchDurationMs: Date.now() - startTime,
        message: `Found via web search (quality: ${(merged.dataQuality * 100).toFixed(0)}%)`,
      };

    } catch (error: any) {
      this.logger.error(`[VIN Search] Error: ${error.message}`);
      return {
        success: false,
        vin: normalizedVin,
        source: 'not_found',
        vehicle: null,
        searchDurationMs: Date.now() - startTime,
        message: `Search error: ${error.message}`,
      };
    }
  }

  /**
   * Save merged data to database via pipeline
   */
  private async saveToDatabase(data: MergedVinData): Promise<void> {
    const rawData = {
      vin: data.vin,
      title: data.title,
      price: data.price,
      images: data.images,
      saleDate: data.saleDate,
      lotNumber: data.lotNumber,
      make: data.make,
      vehicleModel: data.model,
      year: data.year,
      mileage: data.mileage,
      damageType: data.damageType,
      auctionLocation: data.location,
      sources: data.sources,
      sourceUrl: data.sourceUrls[0],
    };

    await this.pipelineService.process(rawData, 'vin_search');
  }

  /**
   * Normalize VIN
   */
  private normalizeVin(vin: string): string | null {
    if (!vin) return null;
    
    const cleaned = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    
    // VIN must be 17 characters
    if (cleaned.length !== 17) {
      this.logger.warn(`Invalid VIN length: ${cleaned} (${cleaned.length})`);
      return null;
    }

    return cleaned;
  }

  /**
   * Get VIN cache stats
   */
  async getCacheStats() {
    return this.vinCache.getStats();
  }

  /**
   * Clear VIN cache
   */
  async clearCache(vin?: string) {
    if (vin) {
      await this.vinCache.delete(vin);
      return { cleared: 1 };
    }
    const count = await this.vinCache.clearExpired();
    return { cleared: count };
  }
}
