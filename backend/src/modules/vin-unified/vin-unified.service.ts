/**
 * VIN Unified Service - 3 Layer Response Model
 * 
 * SCRAPING ONLY - NO API INTEGRATIONS
 * 
 * Flow:
 * 1. validateVIN(vin)
 * 2. cache.get(vin) → return if found
 * 3. localDecoder.decode(vin) → quick basic info
 * 4. discovery.findSources(vin) → PARALLEL scraping
 * 5. extraction.extractAll(sources) → with Cloudflare bypass
 * 6. validation.clean(rawData)
 * 7. merge.merge(validated) → 3 layers
 * 8. scoring.calculate(merged)
 * 9. cache.set(vin, result)
 * 10. return response
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VinDiscoveryService } from './discovery/discovery.service';
import { VinExtractionService } from './extraction/extraction.service';
import { VinValidationService } from './validation/validation.service';
import { VinMergeService, MergeResult } from './merge/merge.service';
import { VinScoringService } from './scoring/scoring.service';
import { VinCacheService } from './cache/cache.service';
import { LocalVinDecoder } from './adapters/local-decoder.adapter';
import { SmartOrchestratorService } from './adapters/smart-orchestrator.service';
import { FallbackEngine } from './fallback/fallback-engine.service';
import { FallbackStrategyService } from './fallback/fallback-strategy.service';
import {
  VinResolveResponseDto,
  CreateVinLeadDto,
  VehicleStatus,
  VehicleLayerDto,
  AuctionLayerDto,
  HistoryLayerDto,
  ShippingLayerDto,
  ConfidenceSummaryDto,
  SourceMetadataDto,
  DataSourceType,
  FallbackMode,
} from './dto/vin.dto';
import { Vehicle } from '../ingestion/schemas/vehicle.schema';
import { LeadsService } from '../leads/leads.service';
import { LeadSource } from '../../shared/enums';

export interface ResolveOptions {
  quick?: boolean;       // Only Tier 1 sources
  skipCache?: boolean;   // Force fresh data
  maxSources?: number;   // Limit sources
  timeout?: number;      // Max time ms
  useOrchestrator?: boolean; // Use smart orchestrator (default: true)
}

@Injectable()
export class VinUnifiedService {
  private readonly logger = new Logger(VinUnifiedService.name);
  private readonly localDecoder = new LocalVinDecoder();

  constructor(
    @InjectModel(Vehicle.name) private vehicleModel: Model<Vehicle>,
    private readonly discovery: VinDiscoveryService,
    private readonly extraction: VinExtractionService,
    private readonly validation: VinValidationService,
    private readonly merge: VinMergeService,
    private readonly scoring: VinScoringService,
    private readonly cache: VinCacheService,
    private readonly leadsService: LeadsService,
    private readonly orchestrator: SmartOrchestratorService,
    private readonly fallbackEngine: FallbackEngine,
    private readonly fallbackStrategy: FallbackStrategyService,
  ) {}

  /**
   * MAIN RESOLVE METHOD - Returns 3-layer response
   * 
   * Architecture:
   * 1. Cache check
   * 2. CORE layer (Copart + IAAI via Smart Orchestrator)
   * 3. If CORE fails → FALLBACK layer (aggregators) with Smart Strategy
   * 4. Response marked with sourceType + verified flag
   */
  async resolve(vin: string, options?: ResolveOptions): Promise<VinResolveResponseDto> {
    const startTime = Date.now();
    const cleanVin = this.normalizeVin(vin);
    const useOrchestrator = options?.useOrchestrator !== false;

    // Step 1: Validate VIN
    if (!cleanVin) {
      return this.errorResponse(vin, startTime, 'Невалідний VIN формат');
    }

    this.logger.log(`[VIN] Resolving: ${cleanVin} | quick=${options?.quick || false} | orchestrator=${useOrchestrator}`);

    try {
      // Step 2: Check cache
      if (!options?.skipCache) {
        const cached = await this.cache.get(cleanVin);
        if (cached) {
          this.logger.log(`[VIN] Cache hit: ${cleanVin}`);
          return {
            ...cached,
            fromCache: true,
            searchDurationMs: Date.now() - startTime,
          };
        }
      }

      // Step 3: Use Local Decoder FIRST (instant)
      const localResult = this.localDecoder.decode(cleanVin);
      const localMetadata: SourceMetadataDto[] = [];
      
      if (localResult) {
        localMetadata.push({
          name: 'LocalDecoder',
          type: 'json',
          tier: 3,
          success: true,
          responseTime: 1,
        });
      }

      // === CORE LAYER (Copart + IAAI) ===
      const maxTier = options?.quick ? 1 : 3;
      const sources = await this.discovery.discoverParallel(cleanVin, maxTier);

      let allExtracted = localResult ? [localResult] : [];
      let metadata = [...localMetadata];
      let coreFound = false;

      // Get fallback strategy BEFORE core execution
      const strategy = this.fallbackStrategy.getStrategy();
      let fallbackPromise: Promise<any> | null = null;

      // If strategy is parallel → start fallback immediately alongside core
      if (strategy.mode === 'parallel' && !options?.quick) {
        this.logger.log(`[VIN] Fallback strategy: PARALLEL (starting fallback immediately)`);
        fallbackPromise = this.fallbackEngine.run(cleanVin);
      }

      // Run CORE sources
      if (sources.length > 0 && !options?.quick) {
        this.logger.log(`[VIN] Starting ${useOrchestrator ? 'orchestrated' : 'parallel'} CORE scraping for ${cleanVin}: ${sources.length} sources`);
        
        try {
          if (useOrchestrator) {
            const tiers = this.orchestrator.buildAdaptiveTiers(sources);
            const result = await this.orchestrator.run(cleanVin, tiers, {
              timeoutMs: options?.timeout || 60000,
              enableEarlyReturn: true,
            });

            metadata = [...localMetadata, ...result.metadata];
            
            this.logger.log(
              `[VIN] Orchestrator done: ${result.vehicles.length} results, ` +
              `winner=${result.winnerSource || 'none'}, earlyReturn=${result.earlyReturn}, ` +
              `duration=${result.totalDurationMs}ms`
            );

            if (result.vehicles.length > 0) {
              allExtracted = [...allExtracted, ...result.vehicles];
              coreFound = true;
            }
          } else {
            const { vehicles: extracted, metadata: scrapingMetadata } = 
              await this.extraction.extractAllWithMetadata(cleanVin, sources, {
                maxConcurrency: 4,
                timeout: options?.timeout || 60000,
                maxRetries: 1,
              });
            
            metadata = [...localMetadata, ...scrapingMetadata];
            
            if (extracted.length > 0) {
              allExtracted = [...allExtracted, ...extracted];
              coreFound = true;
            }
          }
        } catch (err: any) {
          this.logger.warn(`[VIN] CORE scraping failed: ${err.message}`);
        }
      }

      // Validate core results
      if (allExtracted.length > 0) {
        const validated = this.validation.validate(cleanVin, allExtracted);
        if (validated.length > 0) {
          coreFound = validated.some(v => v.source !== 'LocalDecoder');
        }
      }

      // === CORE FOUND → Return with sourceType: 'core', verified: true ===
      if (coreFound && allExtracted.length > 0) {
        const validated = this.validation.validate(cleanVin, allExtracted);
        
        if (validated.length > 0) {
          const { vehicle, auction, history } = this.merge.merge(cleanVin, validated);
          const scoring = auction.found 
            ? this.scoring.calculate({
                price: auction.currentBid,
                year: vehicle.year,
                make: vehicle.make,
                damageType: auction.damageType,
                location: auction.location,
              })
            : undefined;
          const shipping = this.buildShippingLayer();
          const confidence = this.calculateOverallConfidence(vehicle, auction, history, shipping);
          const status = this.determineStatus(vehicle, auction);

          const response: VinResolveResponseDto = {
            success: true,
            vin: cleanVin,
            status,
            vehicle,
            auction,
            history,
            shipping,
            scoring,
            confidence,
            sources: metadata,
            searchDurationMs: Date.now() - startTime,
            fromCache: false,
            sourceType: 'core',
            verified: true,
            fallbackStrategy: {
              mode: strategy.mode,
              delayMs: strategy.delayMs,
              triggered: false,
            },
            message: this.buildMessage(status, confidence),
          };

          await this.cache.set(cleanVin, response, status);

          this.logger.log(
            `[VIN] CORE SUCCESS: ${cleanVin} | status=${status} | confidence=${confidence.overall.toFixed(2)} | ${Date.now() - startTime}ms`
          );

          return response;
        }
      }

      // === CORE FAILED → Try FALLBACK layer ===
      this.logger.log(`[VIN] Core found nothing for ${cleanVin}, activating FALLBACK layer`);

      // If delayed mode → start fallback now (it wasn't started earlier)
      if (strategy.mode === 'delayed' && !options?.quick) {
        fallbackPromise = this.fallbackEngine.run(cleanVin);
      }

      if (fallbackPromise) {
        const fallbackResult = await fallbackPromise;

        if (fallbackResult && fallbackResult.success && fallbackResult.vehicle) {
          // We have fallback data — validate and return as PARTIAL/UNVERIFIED
          const fallbackVehicles = [fallbackResult.vehicle];
          const validated = this.validation.validate(cleanVin, fallbackVehicles);

          if (validated.length > 0) {
            const { vehicle, auction, history } = this.merge.merge(cleanVin, validated);
            const shipping = this.buildShippingLayer();
            const confidence = this.calculateOverallConfidence(vehicle, auction, history, shipping);

            const response: VinResolveResponseDto = {
              success: true,
              vin: cleanVin,
              status: 'PARTIAL',
              vehicle,
              auction,
              history,
              shipping,
              confidence: {
                ...confidence,
                overall: Math.min(confidence.overall, 0.4), // Cap at 0.4 for fallback
              },
              sources: metadata,
              searchDurationMs: Date.now() - startTime,
              fromCache: false,
              sourceType: 'fallback',
              verified: false,
              fallbackStrategy: {
                mode: strategy.mode,
                delayMs: strategy.delayMs,
                triggered: true,
              },
              message: 'Дані з сторонніх джерел (можуть бути неповними або застарілими)',
            };

            await this.cache.set(cleanVin, response, 'PARTIAL');

            this.logger.log(
              `[VIN] FALLBACK SUCCESS: ${cleanVin} | sources=${fallbackResult.sources.join(',')} | ${Date.now() - startTime}ms`
            );

            return response;
          }
        }
      }

      // === NOTHING FOUND ===
      // Check if we have at least local decoder data
      if (localResult) {
        const validated = this.validation.validate(cleanVin, [localResult]);
        if (validated.length > 0) {
          const { vehicle, auction, history } = this.merge.merge(cleanVin, validated);
          const shipping = this.buildShippingLayer();
          const confidence = this.calculateOverallConfidence(vehicle, auction, history, shipping);
          const status = this.determineStatus(vehicle, auction);

          const response: VinResolveResponseDto = {
            success: true,
            vin: cleanVin,
            status,
            vehicle,
            auction,
            history,
            shipping,
            confidence,
            sources: metadata,
            searchDurationMs: Date.now() - startTime,
            fromCache: false,
            sourceType: 'core',
            verified: true,
            fallbackStrategy: {
              mode: strategy.mode,
              delayMs: strategy.delayMs,
              triggered: strategy.mode !== 'disabled',
            },
            message: this.buildMessage(status, confidence),
          };

          await this.cache.set(cleanVin, response, status);
          return response;
        }
      }

      const response = this.notFoundResponse(cleanVin, startTime, metadata);
      await this.cache.set(cleanVin, response, 'NOT_FOUND');
      return response;

    } catch (error: any) {
      this.logger.error(`[VIN] Error: ${error.message}`);
      return this.errorResponse(cleanVin, startTime, error.message);
    }
  }

  /**
   * Create lead from VIN
   */
  async createLead(dto: CreateVinLeadDto): Promise<{ success: boolean; leadId?: string; message: string }> {
    const cleanVin = this.normalizeVin(dto.vin);
    
    if (!cleanVin) {
      return { success: false, message: 'Невалідний VIN код' };
    }

    try {
      const vinResult = await this.resolve(cleanVin);

      const vehicleTitle = vinResult.vehicle.year && vinResult.vehicle.make
        ? `${vinResult.vehicle.year} ${vinResult.vehicle.make} ${vinResult.vehicle.model || ''}`.trim()
        : 'Авто за VIN';

      const lead = await this.leadsService.create({
        firstName: dto.firstName || 'Клієнт',
        lastName: dto.lastName || 'VIN-пошук',
        email: dto.email || '',
        phone: dto.phone || '',
        source: LeadSource.VIN_ENGINE,
        description: `VIN: ${cleanVin}\n${vehicleTitle}\n\n${dto.message || ''}`,
      }, 'system', 'system', 'VIN Search');

      return {
        success: true,
        leadId: lead?.id || lead?._id?.toString() || 'unknown',
        message: 'Заявку створено успішно',
      };

    } catch (error: any) {
      this.logger.error(`[VIN] Lead creation error: ${error.message}`);
      return { success: false, message: 'Помилка при створенні заявки' };
    }
  }

  // ============ HELPER METHODS ============

  private normalizeVin(vin: string): string | null {
    if (!vin) return null;
    const cleaned = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (cleaned.length !== 17) return null;
    return cleaned;
  }

  private buildShippingLayer(): ShippingLayerDto {
    return {
      found: false,
      reason: 'Для відстеження доставки потрібен номер контейнера або коносамента',
      confidence: 'unavailable',
    };
  }

  private calculateOverallConfidence(
    vehicle: VehicleLayerDto,
    auction: AuctionLayerDto,
    history: HistoryLayerDto,
    shipping: ShippingLayerDto,
  ): ConfidenceSummaryDto {
    const levelToNumber = (level: string): number => {
      switch (level) {
        case 'confirmed': return 1.0;
        case 'probable': return 0.75;
        case 'weak': return 0.5;
        default: return 0;
      }
    };

    const vehicleScore = levelToNumber(vehicle.confidence);
    const auctionScore = auction.found ? levelToNumber(auction.confidence) : 0;
    const historyScore = history.found ? levelToNumber(history.confidence) : 0;

    // Weighted average (vehicle most important)
    const overall = (vehicleScore * 0.4 + auctionScore * 0.4 + historyScore * 0.2);

    return {
      overall: Number(overall.toFixed(2)),
      vehicleLayer: vehicle.confidence,
      auctionLayer: auction.confidence,
      historyLayer: history.confidence,
      shippingLayer: shipping.confidence,
    };
  }

  private determineStatus(vehicle: VehicleLayerDto, auction: AuctionLayerDto): VehicleStatus {
    if (vehicle.confidence === 'unavailable' && !auction.found) {
      return 'NOT_FOUND';
    }

    if (vehicle.confidence !== 'unavailable' && !auction.found) {
      return 'PARTIAL';
    }

    if (auction.found && auction.status === 'upcoming') {
      return 'AUCTION_ACTIVE';
    }

    if (auction.found && auction.status === 'sold') {
      return 'SOLD';
    }

    return 'FOUND';
  }

  private buildMessage(status: VehicleStatus, confidence: ConfidenceSummaryDto): string {
    const confidenceText = confidence.overall >= 0.8 ? 'висока' 
      : confidence.overall >= 0.5 ? 'середня' 
      : 'низька';

    switch (status) {
      case 'NOT_FOUND':
        return 'Інформація по VIN не знайдена';
      case 'PARTIAL':
        return `Базова інформація знайдена (впевненість: ${confidenceText})`;
      case 'AUCTION_ACTIVE':
        return `Авто на активному аукціоні (впевненість: ${confidenceText})`;
      case 'SOLD':
        return `Авто продано на аукціоні (впевненість: ${confidenceText})`;
      default:
        return `Знайдено (впевненість: ${confidenceText})`;
    }
  }

  private errorResponse(vin: string, startTime: number, message: string): VinResolveResponseDto {
    return {
      success: false,
      vin,
      status: 'NOT_FOUND',
      vehicle: this.emptyVehicleLayer(),
      auction: this.emptyAuctionLayer(),
      history: this.emptyHistoryLayer(),
      shipping: this.buildShippingLayer(),
      confidence: {
        overall: 0,
        vehicleLayer: 'unavailable',
        auctionLayer: 'unavailable',
        historyLayer: 'unavailable',
        shippingLayer: 'unavailable',
      },
      sources: [],
      searchDurationMs: Date.now() - startTime,
      fromCache: false,
      sourceType: 'core',
      verified: false,
      message,
    };
  }

  private notFoundResponse(vin: string, startTime: number, sources: SourceMetadataDto[]): VinResolveResponseDto {
    return {
      success: false,
      vin,
      status: 'NOT_FOUND',
      vehicle: this.emptyVehicleLayer(),
      auction: this.emptyAuctionLayer(),
      history: this.emptyHistoryLayer(),
      shipping: this.buildShippingLayer(),
      confidence: {
        overall: 0,
        vehicleLayer: 'unavailable',
        auctionLayer: 'unavailable',
        historyLayer: 'unavailable',
        shippingLayer: 'unavailable',
      },
      sources,
      searchDurationMs: Date.now() - startTime,
      fromCache: false,
      sourceType: 'core',
      verified: false,
      message: 'Інформація по VIN не знайдена',
    };
  }

  private emptyVehicleLayer(): VehicleLayerDto {
    return {
      year: null,
      make: null,
      model: null,
      confidence: 'unavailable',
      source: 'cache',
    };
  }

  private emptyAuctionLayer(): AuctionLayerDto {
    return {
      found: false,
      source: null,
      lotNumber: null,
      status: null,
      saleDate: null,
      location: null,
      currentBid: null,
      buyNowPrice: null,
      estimatedValue: null,
      damageType: null,
      odometer: null,
      images: [],
      auctionUrl: null,
      confidence: 'unavailable',
      allSources: [],
    };
  }

  private emptyHistoryLayer(): HistoryLayerDto {
    return {
      found: false,
      titleRecords: 0,
      accidents: 0,
      owners: 0,
      serviceRecords: 0,
      salvageRecord: false,
      floodDamage: false,
      frameDamage: false,
      airbagDeployed: false,
      odometerRollback: false,
      confidence: 'unavailable',
    };
  }
}
