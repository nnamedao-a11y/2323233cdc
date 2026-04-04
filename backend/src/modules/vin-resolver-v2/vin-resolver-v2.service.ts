/**
 * VIN Resolver Service V2
 * 
 * ОДИН ENDPOINT, ОДИН TRUTH
 * 
 * Flow:
 * VIN → Discovery → Extraction → Validation → Merge → Status → Pricing → Result
 * 
 * Fallback: Parsing Mesh для вищого hit rate
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { VinDiscoveryService } from './services/vin-discovery.service';
import { VinExtractionService } from './services/vin-extraction.service';
import { VinValidationService } from './services/vin-validation.service';
import { VinMergeService } from './services/vin-merge.service';
import { VinStatusService } from './services/vin-status.service';
import { VinPricingBridgeService } from './services/vin-pricing-bridge.service';
import { VinResolverResponseDto } from './dto/vin-resolver-response.dto';
import { VinOrchestratorService } from '../parsing-mesh/orchestrator/vin-orchestrator.service';

@Injectable()
export class VinResolverV2Service {
  private readonly logger = new Logger(VinResolverV2Service.name);

  constructor(
    private readonly discovery: VinDiscoveryService,
    private readonly extraction: VinExtractionService,
    private readonly validation: VinValidationService,
    private readonly merge: VinMergeService,
    private readonly status: VinStatusService,
    private readonly pricing: VinPricingBridgeService,
    @Optional() private readonly meshOrchestrator?: VinOrchestratorService,
  ) {}

  /**
   * MAIN RESOLVE METHOD
   * Один VIN → один фінальний результат
   */
  async resolve(vin: string, options?: {
    maxTier?: 1 | 2 | 3 | 4;
    skipPricing?: boolean;
  }): Promise<VinResolverResponseDto> {
    const startTime = Date.now();
    const normalizedVin = this.normalizeVin(vin);

    // Validate VIN format
    if (!normalizedVin) {
      return this.notFoundResponse(vin, startTime, 'Невалідний VIN формат (має бути 17 символів)');
    }

    this.logger.log(`[ResolverV2] Starting resolve for ${normalizedVin}`);

    try {
      // Step 1: Discovery - знайти всі URL
      const maxTier = options?.maxTier || 3;
      const discovered = await this.discovery.discoverUpToTier(normalizedVin, maxTier);
      
      if (discovered.length === 0) {
        // Fallback to parsing-mesh
        return this.fallbackToMesh(normalizedVin, startTime, options);
      }

      this.logger.debug(`[ResolverV2] Discovered ${discovered.length} sources`);

      // Step 2: Extraction - витягти дані з кожного URL
      const extracted = await this.extraction.extractAll(normalizedVin, discovered);

      if (extracted.length === 0) {
        // Fallback to parsing-mesh
        return this.fallbackToMesh(normalizedVin, startTime, options);
      }

      // Step 3: Validation - викинути мусор
      const validated = this.validation.validate(normalizedVin, extracted);

      if (validated.length === 0) {
        // Fallback to parsing-mesh
        return this.fallbackToMesh(normalizedVin, startTime, options);
      }

      // Step 4: Merge - об'єднати результати
      const merged = this.merge.merge(normalizedVin, validated);

      if (!merged) {
        return this.notFoundResponse(normalizedVin, startTime, 'Помилка об\'єднання даних');
      }

      // Check if we should enhance with mesh data
      if (merged.confidence < 0.7 && this.meshOrchestrator) {
        const enhanced = await this.enhanceWithMesh(normalizedVin, merged);
        if (enhanced) {
          Object.assign(merged, enhanced);
        }
      }

      // Step 5: Status - визначити статус аукціону
      const detectedStatus = this.status.detect(merged);

      // Step 6: Pricing - розрахувати ціни (якщо не skipPricing)
      const pricingResult = options?.skipPricing ? null : await this.pricing.calculate(merged);

      // Step 7: Build final response
      const duration = Date.now() - startTime;

      const response: VinResolverResponseDto = {
        vin: normalizedVin,
        status: detectedStatus,
        confidence: merged.confidence,
        vehicle: {
          title: merged.title,
          year: merged.year,
          make: merged.make,
          model: merged.model,
          lotNumber: merged.lotNumber,
          location: merged.location,
          saleDate: merged.saleDate,
          price: merged.price,
          images: merged.images,
          damageType: merged.damageType,
          mileage: merged.mileage,
        },
        pricing: pricingResult ? {
          marketPrice: pricingResult.marketPrice,
          maxBid: pricingResult.maxBid,
          safeBid: pricingResult.safeBid,
          breakEvenBid: pricingResult.breakEvenBid,
          finalAllInPrice: pricingResult.finalAllInPrice,
          dealStatus: pricingResult.dealStatus,
          platformMargin: pricingResult.platformMargin,
          deliveryCost: pricingResult.deliveryCost,
          repairEstimate: pricingResult.repairEstimate,
        } : undefined,
        sourcesUsed: merged.sourcesUsed,
        sourceCount: merged.sourceCount,
        searchDurationMs: duration,
        message: this.status.getStatusMessage(detectedStatus, merged),
      };

      this.logger.log(
        `[ResolverV2] SUCCESS: ${normalizedVin} | status=${detectedStatus} | ` +
        `confidence=${merged.confidence} | sources=${merged.sourceCount} | ${duration}ms`
      );

      return response;

    } catch (error: any) {
      this.logger.error(`[ResolverV2] Error resolving ${normalizedVin}: ${error.message}`);
      return this.notFoundResponse(normalizedVin, startTime, `Помилка: ${error.message}`);
    }
  }

  /**
   * Quick resolve - only tier 1 sources (faster)
   */
  async resolveQuick(vin: string): Promise<VinResolverResponseDto> {
    return this.resolve(vin, { maxTier: 1 });
  }

  /**
   * Full resolve - all tiers (slower but more complete)
   */
  async resolveFull(vin: string): Promise<VinResolverResponseDto> {
    return this.resolve(vin, { maxTier: 4 });
  }

  private normalizeVin(vin: string): string | null {
    if (!vin) return null;
    const cleaned = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (cleaned.length !== 17) return null;
    return cleaned;
  }

  private notFoundResponse(vin: string, startTime: number, message: string): VinResolverResponseDto {
    return {
      vin,
      status: 'NOT_FOUND',
      confidence: 0,
      vehicle: { images: [] },
      sourcesUsed: [],
      sourceCount: 0,
      searchDurationMs: Date.now() - startTime,
      message,
    };
  }

  /**
   * Fallback to Parsing Mesh for higher hit rate
   */
  private async fallbackToMesh(
    vin: string, 
    startTime: number, 
    options?: { skipPricing?: boolean }
  ): Promise<VinResolverResponseDto> {
    if (!this.meshOrchestrator) {
      return this.notFoundResponse(vin, startTime, 'Дані не знайдено');
    }

    this.logger.log(`[ResolverV2] Falling back to Parsing Mesh for ${vin}`);

    try {
      const meshResult = await this.meshOrchestrator.search(vin);

      if (!meshResult.success || !meshResult.merged) {
        return this.notFoundResponse(vin, startTime, 'Дані не знайдено (mesh fallback)');
      }

      const m = meshResult.merged as any;
      
      // Convert mesh result to our format
      const merged = {
        vin,
        title: m.title,
        year: m.year,
        make: m.make,
        model: m.model,
        lotNumber: m.lotNumber,
        location: m.location,
        saleDate: m.saleDate,
        price: m.price || m.currentBid || m.finalBid,
        images: m.images || m.allImages || [],
        damageType: m.damage || m.primaryDamage,
        mileage: m.mileage,
        confidence: m.confidence || 0.7,
        sourcesUsed: meshResult.sourceBreakdown?.filter(s => s.status === 'success').map(s => s.source) || [],
        sourceCount: meshResult.sourcesSuccessful,
      };

      const detectedStatus = this.status.detect(merged);
      const pricingResult = options?.skipPricing ? null : await this.pricing.calculate(merged);

      const response: VinResolverResponseDto = {
        vin,
        status: detectedStatus,
        confidence: merged.confidence,
        vehicle: {
          title: merged.title,
          year: merged.year,
          make: merged.make,
          model: merged.model,
          lotNumber: merged.lotNumber,
          location: merged.location,
          saleDate: merged.saleDate,
          price: merged.price,
          images: merged.images,
          damageType: merged.damageType,
          mileage: merged.mileage,
        },
        pricing: pricingResult ? {
          marketPrice: pricingResult.marketPrice,
          maxBid: pricingResult.maxBid,
          safeBid: pricingResult.safeBid,
          breakEvenBid: pricingResult.breakEvenBid,
          finalAllInPrice: pricingResult.finalAllInPrice,
          dealStatus: pricingResult.dealStatus,
          platformMargin: pricingResult.platformMargin,
          deliveryCost: pricingResult.deliveryCost,
          repairEstimate: pricingResult.repairEstimate,
        } : undefined,
        sourcesUsed: merged.sourcesUsed,
        sourceCount: merged.sourceCount,
        searchDurationMs: Date.now() - startTime,
        message: `Знайдено через mesh: ${meshResult.sourcesSuccessful} джерел`,
      };

      this.logger.log(`[ResolverV2] MESH SUCCESS: ${vin} | sources=${meshResult.sourcesSuccessful}`);
      return response;

    } catch (error: any) {
      this.logger.warn(`[ResolverV2] Mesh fallback failed: ${error.message}`);
      return this.notFoundResponse(vin, startTime, 'Дані не знайдено');
    }
  }

  /**
   * Enhance low-confidence results with mesh data
   */
  private async enhanceWithMesh(vin: string, currentMerged: any): Promise<any | null> {
    if (!this.meshOrchestrator) return null;

    try {
      const meshResult = await this.meshOrchestrator.search(vin, { maxSources: 5 });
      
      if (!meshResult.success || !meshResult.merged) return null;

      const m = meshResult.merged as any;
      
      // Only enhance missing fields
      const enhanced: any = {};
      
      if (!currentMerged.price && (m.price || m.currentBid)) {
        enhanced.price = m.price || m.currentBid;
      }
      if (!currentMerged.lotNumber && m.lotNumber) {
        enhanced.lotNumber = m.lotNumber;
      }
      if (!currentMerged.location && m.location) {
        enhanced.location = m.location;
      }
      if (!currentMerged.saleDate && m.saleDate) {
        enhanced.saleDate = m.saleDate;
      }
      if ((currentMerged.images?.length || 0) < ((m.images || m.allImages)?.length || 0)) {
        enhanced.images = [...new Set([...(currentMerged.images || []), ...(m.images || m.allImages || [])])];
      }
      if (!currentMerged.damageType && m.damage) {
        enhanced.damageType = m.damage;
      }
      if (!currentMerged.mileage && m.mileage) {
        enhanced.mileage = m.mileage;
      }

      if (Object.keys(enhanced).length > 0) {
        enhanced.confidence = Math.min(currentMerged.confidence + 0.1, 0.95);
        enhanced.sourcesUsed = [...new Set([...currentMerged.sourcesUsed, ...meshResult.sourceBreakdown?.filter(s => s.status === 'success').map(s => s.source) || []])];
        enhanced.sourceCount = enhanced.sourcesUsed.length;
        
        this.logger.log(`[ResolverV2] Enhanced with mesh: +${Object.keys(enhanced).length} fields`);
        return enhanced;
      }

      return null;
    } catch (error: any) {
      this.logger.warn(`[ResolverV2] Mesh enhance failed: ${error.message}`);
      return null;
    }
  }
}
