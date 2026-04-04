/**
 * VIN Resolver Service - FINAL TRUTH ENGINE
 * 
 * Один endpoint, один truth.
 * Собирает всё: parsing mesh + auction status + price engine + confidence
 * 
 * GET /api/vin-resolver/:vin
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle } from '../ingestion/schemas/vehicle.schema';
import { VinSearchOrchestratorService } from '../vin-engine/providers/vin-search-orchestrator.service';
import { VinCacheService } from '../vin-engine/vin-cache.service';

// =============================================
// TYPES
// =============================================

export enum VinStatus {
  ACTIVE_AUCTION = 'ACTIVE_AUCTION',
  AUCTION_FINISHED = 'AUCTION_FINISHED',
  HISTORICAL_RECORD = 'HISTORICAL_RECORD',
  NOT_FOUND = 'NOT_FOUND',
}

export enum DealStatus {
  EXCELLENT_DEAL = 'EXCELLENT_DEAL',  // < 60% market
  GOOD_DEAL = 'GOOD_DEAL',            // 60-75% market
  FAIR_DEAL = 'FAIR_DEAL',            // 75-85% market
  RISKY_DEAL = 'RISKY_DEAL',          // 85-95% market
  OVERPRICED = 'OVERPRICED',          // > 95% market
  UNKNOWN = 'UNKNOWN',
}

export interface VehicleData {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  title?: string;
  images: string[];
  location?: string;
  lotNumber?: string;
  saleDate?: Date;
  source?: string;
  mileage?: number;
  damageType?: string;
  driveType?: string;
  fuelType?: string;
  engine?: string;
  transmission?: string;
  color?: string;
  keys?: boolean;
}

export interface PricingData {
  auctionPrice?: number;           // Текущая/последняя ставка
  marketPrice?: number;            // Рыночная цена
  recommendedMaxBid?: number;      // Макс. рекомендуемая ставка
  breakEvenBid?: number;           // Точка безубыточности
  finalAllInPrice?: number;        // Финальная цена all-in
  platformMargin?: number;         // Маржа платформы
  deliveryCost?: number;           // Доставка
  customsCost?: number;            // Растаможка
  repairEstimate?: number;         // Оценка ремонта
  dealStatus: DealStatus;
  priceConfidence: number;         // 0-1
}

export interface FieldConfidence {
  field: string;
  value: any;
  confidence: number;
  source: string;
}

export interface VinResolverResult {
  vin: string;
  status: VinStatus;
  confidence: number;
  vehicle: VehicleData | null;
  pricing: PricingData | null;
  fieldConfidence: FieldConfidence[];
  sourcesUsed: string[];
  sourceBreakdown: {
    source: string;
    status: 'success' | 'empty' | 'error';
    fieldsProvided: string[];
  }[];
  searchDurationMs: number;
  timestamp: Date;
  message: string;
}

// =============================================
// SERVICE
// =============================================

@Injectable()
export class VinResolverService {
  private readonly logger = new Logger(VinResolverService.name);

  // Pricing constants (можно вынести в конфиг)
  private readonly AUCTION_FEE_PERCENT = 0.10;      // 10% аукционный сбор
  private readonly PLATFORM_MARGIN_PERCENT = 0.12;  // 12% маржа платформы
  private readonly AVG_DELIVERY_COST = 1500;        // USD
  private readonly AVG_CUSTOMS_PERCENT = 0.10;      // 10% растаможка
  private readonly REPAIR_MULTIPLIER = 0.15;        // 15% от цены на ремонт

  constructor(
    @InjectModel(Vehicle.name)
    private vehicleModel: Model<Vehicle>,
    private vinOrchestrator: VinSearchOrchestratorService,
    private vinCache: VinCacheService,
  ) {}

  /**
   * MAIN RESOLVE METHOD
   * Один endpoint, один truth
   */
  async resolve(vin: string, options?: {
    forceRefresh?: boolean;
    includeEstimates?: boolean;
    destinationCountry?: string;
  }): Promise<VinResolverResult> {
    const startTime = Date.now();
    const normalizedVin = this.normalizeVin(vin);

    if (!normalizedVin) {
      return this.notFoundResult(vin, startTime, 'Invalid VIN format (must be 17 characters)');
    }

    this.logger.log(`[VinResolver] Starting resolve for ${normalizedVin}`);

    try {
      // Step 1: Check local DB first
      const dbVehicle = await this.vehicleModel.findOne({
        vin: normalizedVin,
        isDeleted: { $ne: true },
      });

      if (dbVehicle && !options?.forceRefresh) {
        this.logger.log(`[VinResolver] Found in DB: ${normalizedVin}`);
        return this.buildResultFromDb(dbVehicle, startTime);
      }

      // Step 2: Run full orchestrator search
      const searchResult = await this.vinOrchestrator.search(normalizedVin, options?.forceRefresh);

      if (!searchResult.success || !searchResult.merged) {
        // Check if we have historical data in DB
        if (dbVehicle) {
          return this.buildResultFromDb(dbVehicle, startTime, true);
        }
        return this.notFoundResult(normalizedVin, startTime, searchResult.message);
      }

      // Step 3: Build vehicle data from merged result
      const vehicle = this.buildVehicleData(searchResult.merged, searchResult.candidates);

      // Step 4: Determine auction status
      const status = this.determineStatus(vehicle, searchResult.merged);

      // Step 5: Calculate pricing
      const pricing = this.calculatePricing(
        vehicle,
        searchResult.merged,
        options?.destinationCountry || 'UA'
      );

      // Step 6: Calculate field confidence
      const fieldConfidence = this.calculateFieldConfidence(searchResult.candidates, vehicle);

      // Step 7: Build source breakdown
      const sourceBreakdown = this.buildSourceBreakdown(searchResult.candidates);

      // Step 8: Calculate overall confidence
      const confidence = this.calculateOverallConfidence(fieldConfidence, searchResult.candidates.length);

      // Step 9: Save/update to DB for future queries
      await this.saveToDb(normalizedVin, vehicle, pricing, status, confidence, searchResult.candidates);

      const result: VinResolverResult = {
        vin: normalizedVin,
        status,
        confidence,
        vehicle,
        pricing,
        fieldConfidence,
        sourcesUsed: [...new Set(searchResult.candidates.map(c => c.sourceName))],
        sourceBreakdown,
        searchDurationMs: Date.now() - startTime,
        timestamp: new Date(),
        message: this.buildStatusMessage(status, confidence, searchResult.candidates.length),
      };

      this.logger.log(
        `[VinResolver] Resolved ${normalizedVin}: status=${status}, confidence=${(confidence * 100).toFixed(0)}%, ` +
        `sources=${result.sourcesUsed.length}, ${Date.now() - startTime}ms`
      );

      return result;

    } catch (error: any) {
      this.logger.error(`[VinResolver] Error resolving ${normalizedVin}: ${error.message}`);
      return this.notFoundResult(normalizedVin, startTime, `Error: ${error.message}`);
    }
  }

  // =============================================
  // AUCTION STATUS ENGINE
  // =============================================

  private determineStatus(vehicle: VehicleData, merged: any): VinStatus {
    const now = new Date();
    const saleDate = vehicle.saleDate ? new Date(vehicle.saleDate) : null;

    // Check if active auction
    if (saleDate && saleDate > now) {
      return VinStatus.ACTIVE_AUCTION;
    }

    // Check if auction finished (has sale date in past + auction source)
    if (saleDate && saleDate <= now) {
      const auctionSources = ['copart', 'iaai', 'autobidmaster', 'salvagebid', 'bidfax'];
      const hasAuctionSource = merged?.sourceName && 
        auctionSources.some(s => merged.sourceName.toLowerCase().includes(s));
      
      if (hasAuctionSource || merged?.lotNumber) {
        return VinStatus.AUCTION_FINISHED;
      }
    }

    // Has historical data but no active/finished auction
    if (vehicle.year || vehicle.make || merged?.price) {
      return VinStatus.HISTORICAL_RECORD;
    }

    return VinStatus.NOT_FOUND;
  }

  // =============================================
  // PRICING ENGINE
  // =============================================

  private calculatePricing(
    vehicle: VehicleData,
    merged: any,
    destinationCountry: string
  ): PricingData {
    const auctionPrice = merged?.price || null;
    
    // Estimate market price
    const marketPrice = this.estimateMarketPrice(vehicle, merged);
    
    if (!marketPrice && !auctionPrice) {
      return {
        dealStatus: DealStatus.UNKNOWN,
        priceConfidence: 0,
      };
    }

    // Calculate costs
    const auctionFee = auctionPrice ? auctionPrice * this.AUCTION_FEE_PERCENT : 0;
    const deliveryCost = this.estimateDeliveryCost(vehicle.location, destinationCountry);
    const customsCost = marketPrice ? marketPrice * this.AVG_CUSTOMS_PERCENT : 0;
    const repairEstimate = this.estimateRepairCost(vehicle, merged);
    const platformMargin = marketPrice ? marketPrice * this.PLATFORM_MARGIN_PERCENT : 0;

    // Calculate recommended max bid
    // Max bid = Market Price - All Costs - Desired Margin
    const totalCosts = auctionFee + deliveryCost + customsCost + repairEstimate + platformMargin;
    const recommendedMaxBid = marketPrice ? Math.max(0, marketPrice * 0.55 - repairEstimate) : null;
    
    // Break-even bid = Market Price - All Costs
    const breakEvenBid = marketPrice ? Math.max(0, marketPrice - totalCosts) : null;

    // Final all-in price (if current auction price exists)
    const finalAllInPrice = auctionPrice 
      ? auctionPrice + auctionFee + deliveryCost + customsCost + repairEstimate + platformMargin
      : null;

    // Determine deal status
    const dealStatus = this.determineDealStatus(auctionPrice, marketPrice, totalCosts);

    // Price confidence based on data quality
    const priceConfidence = this.calculatePriceConfidence(vehicle, merged, marketPrice);

    return {
      auctionPrice: auctionPrice || undefined,
      marketPrice: marketPrice || undefined,
      recommendedMaxBid: recommendedMaxBid ? Math.round(recommendedMaxBid) : undefined,
      breakEvenBid: breakEvenBid ? Math.round(breakEvenBid) : undefined,
      finalAllInPrice: finalAllInPrice ? Math.round(finalAllInPrice) : undefined,
      platformMargin: platformMargin ? Math.round(platformMargin) : undefined,
      deliveryCost: Math.round(deliveryCost),
      customsCost: customsCost ? Math.round(customsCost) : undefined,
      repairEstimate: repairEstimate ? Math.round(repairEstimate) : undefined,
      dealStatus,
      priceConfidence,
    };
  }

  private estimateMarketPrice(vehicle: VehicleData, merged: any): number | null {
    // Simple market price estimation based on vehicle data
    // In production, this would use ML model or external API
    
    if (!vehicle.year || !vehicle.make) return null;

    // Base prices by age
    const currentYear = new Date().getFullYear();
    const age = currentYear - vehicle.year;
    
    // Very rough base prices by make tier
    const premiumMakes = ['bmw', 'mercedes', 'audi', 'lexus', 'porsche', 'tesla'];
    const midMakes = ['toyota', 'honda', 'mazda', 'subaru', 'volkswagen', 'hyundai', 'kia'];
    
    let basePrice = 25000; // Default
    
    const makeLower = vehicle.make.toLowerCase();
    if (premiumMakes.some(m => makeLower.includes(m))) {
      basePrice = 45000;
    } else if (midMakes.some(m => makeLower.includes(m))) {
      basePrice = 28000;
    }

    // Depreciation: ~15% per year
    const depreciatedPrice = basePrice * Math.pow(0.85, age);
    
    // Salvage discount: 40-60% off market
    const salvageDiscount = 0.45;
    
    // Damage adjustment
    let damageMultiplier = 1.0;
    if (vehicle.damageType) {
      const damageLower = vehicle.damageType.toLowerCase();
      if (damageLower.includes('front') || damageLower.includes('rear')) {
        damageMultiplier = 0.85;
      } else if (damageLower.includes('flood') || damageLower.includes('fire')) {
        damageMultiplier = 0.60;
      } else if (damageLower.includes('side')) {
        damageMultiplier = 0.90;
      }
    }

    // Mileage adjustment
    let mileageMultiplier = 1.0;
    if (vehicle.mileage) {
      if (vehicle.mileage > 150000) mileageMultiplier = 0.70;
      else if (vehicle.mileage > 100000) mileageMultiplier = 0.80;
      else if (vehicle.mileage > 75000) mileageMultiplier = 0.90;
      else if (vehicle.mileage > 50000) mileageMultiplier = 0.95;
    }

    const estimatedMarket = depreciatedPrice * salvageDiscount * damageMultiplier * mileageMultiplier;
    
    return Math.round(estimatedMarket);
  }

  private estimateDeliveryCost(location: string | undefined, destination: string): number {
    // Simplified delivery cost estimation
    const baseDelivery = this.AVG_DELIVERY_COST;
    
    if (!location) return baseDelivery;
    
    // US West Coast costs more for European delivery
    const westCoastStates = ['ca', 'wa', 'or', 'az', 'nv'];
    const locationLower = location.toLowerCase();
    
    if (westCoastStates.some(s => locationLower.includes(s))) {
      return baseDelivery + 800;
    }
    
    return baseDelivery;
  }

  private estimateRepairCost(vehicle: VehicleData, merged: any): number {
    if (!merged?.price) return 0;
    
    let repairMultiplier = this.REPAIR_MULTIPLIER;
    
    if (vehicle.damageType) {
      const damageLower = vehicle.damageType.toLowerCase();
      if (damageLower.includes('front end')) repairMultiplier = 0.25;
      else if (damageLower.includes('rear end')) repairMultiplier = 0.20;
      else if (damageLower.includes('side')) repairMultiplier = 0.18;
      else if (damageLower.includes('flood')) repairMultiplier = 0.40;
      else if (damageLower.includes('fire')) repairMultiplier = 0.50;
      else if (damageLower.includes('mechanical')) repairMultiplier = 0.30;
    }
    
    return merged.price * repairMultiplier;
  }

  private determineDealStatus(
    auctionPrice: number | null,
    marketPrice: number | null,
    totalCosts: number
  ): DealStatus {
    if (!auctionPrice || !marketPrice) return DealStatus.UNKNOWN;
    
    const totalInvestment = auctionPrice + totalCosts;
    const ratio = totalInvestment / marketPrice;
    
    if (ratio < 0.60) return DealStatus.EXCELLENT_DEAL;
    if (ratio < 0.75) return DealStatus.GOOD_DEAL;
    if (ratio < 0.85) return DealStatus.FAIR_DEAL;
    if (ratio < 0.95) return DealStatus.RISKY_DEAL;
    return DealStatus.OVERPRICED;
  }

  private calculatePriceConfidence(vehicle: VehicleData, merged: any, marketPrice: number | null): number {
    let confidence = 0.5;
    
    if (vehicle.year) confidence += 0.1;
    if (vehicle.make) confidence += 0.1;
    if (vehicle.model) confidence += 0.05;
    if (vehicle.mileage) confidence += 0.1;
    if (vehicle.damageType) confidence += 0.05;
    if (merged?.price) confidence += 0.1;
    
    return Math.min(1, confidence);
  }

  // =============================================
  // CONFIDENCE CALCULATION
  // =============================================

  private calculateFieldConfidence(candidates: any[], vehicle: VehicleData): FieldConfidence[] {
    const fields: FieldConfidence[] = [];
    
    const addField = (field: string, value: any) => {
      if (value === undefined || value === null || value === '') return;
      
      // Count how many sources have this field
      const sourcesWithField = candidates.filter(c => {
        const v = c[field] || c.raw?.[field];
        return v !== undefined && v !== null && v !== '';
      });
      
      const confidence = Math.min(1, sourcesWithField.length / Math.max(1, candidates.length) + 0.3);
      const source = sourcesWithField[0]?.sourceName || 'merged';
      
      fields.push({ field, value, confidence, source });
    };
    
    addField('year', vehicle.year);
    addField('make', vehicle.make);
    addField('model', vehicle.model);
    addField('mileage', vehicle.mileage);
    addField('damageType', vehicle.damageType);
    addField('location', vehicle.location);
    addField('saleDate', vehicle.saleDate);
    addField('lotNumber', vehicle.lotNumber);
    addField('images', vehicle.images?.length > 0 ? `${vehicle.images.length} images` : null);
    
    return fields;
  }

  private calculateOverallConfidence(fieldConfidence: FieldConfidence[], sourceCount: number): number {
    if (fieldConfidence.length === 0) return 0;
    
    // Weight important fields higher
    const weights: Record<string, number> = {
      year: 1.5,
      make: 1.5,
      model: 1.2,
      mileage: 1.0,
      damageType: 0.8,
      location: 0.6,
      saleDate: 1.0,
      lotNumber: 0.5,
      images: 0.8,
    };
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (const fc of fieldConfidence) {
      const weight = weights[fc.field] || 0.5;
      weightedSum += fc.confidence * weight;
      totalWeight += weight;
    }
    
    const baseConfidence = weightedSum / totalWeight;
    
    // Boost for multiple sources
    const sourceBoost = Math.min(0.2, sourceCount * 0.05);
    
    return Math.min(1, baseConfidence + sourceBoost);
  }

  // =============================================
  // HELPERS
  // =============================================

  private cleanTitle(title: string | null | undefined): string | null {
    if (!title) return null;
    
    // Skip spam/landing page titles
    const spamPatterns = [
      'auto auctions', '100% online', 'million used', 'wholesale',
      'repairable cars', 'per year', 'salvage vehicles for sale',
      'buy car', 'sell car', 'welcome', 'homepage', 'search results',
      'sign up', 'register', 'login', 'create account',
    ];
    
    const lowerTitle = title.toLowerCase();
    for (const pattern of spamPatterns) {
      if (lowerTitle.includes(pattern)) {
        return null;
      }
    }
    
    // Title too long = probably landing page text
    if (title.length > 100) {
      return null;
    }
    
    // Title has newlines = scraped block of text
    if (title.includes('\n')) {
      return null;
    }
    
    return title.trim();
  }

  private buildVehicleData(merged: any, candidates: any[]): VehicleData {
    // Build clean title from parts if raw title is garbage
    let cleanedTitle = this.cleanTitle(merged.title);
    
    // If no clean title, build from year/make/model
    if (!cleanedTitle && (merged.year || merged.make || merged.model)) {
      cleanedTitle = `${merged.year || ''} ${merged.make || ''} ${merged.model || ''}`.trim() || null;
    }
    
    return {
      vin: merged.vin,
      year: merged.year,
      make: merged.make,
      model: merged.model,
      title: cleanedTitle || undefined,
      images: this.filterValidImages(merged.images),
      location: merged.location,
      lotNumber: merged.lotNumber,
      saleDate: merged.saleDate ? new Date(merged.saleDate) : undefined,
      source: merged.sourceName,
      mileage: merged.mileage ? parseInt(merged.mileage) : undefined,
      damageType: merged.damageType,
      driveType: merged.driveType,
      fuelType: merged.fuelType,
      engine: merged.engine,
      transmission: merged.transmission,
      color: merged.color,
      keys: merged.keys,
    };
  }

  private filterValidImages(images: string[] | null | undefined): string[] {
    if (!images || !Array.isArray(images)) return [];
    
    const landingImagePatterns = ['landing-page', 'hero', 'banner', 'logo', 'icon', 'avatar', 'suvs.png', 'homepage'];
    
    return images.filter(img => {
      if (!img) return false;
      const lowerImg = img.toLowerCase();
      return !landingImagePatterns.some(pattern => lowerImg.includes(pattern));
    });
  }

  private buildSourceBreakdown(candidates: any[]): VinResolverResult['sourceBreakdown'] {
    const sourceMap = new Map<string, { fieldsProvided: Set<string> }>();
    
    for (const c of candidates) {
      const source = c.sourceName || 'unknown';
      if (!sourceMap.has(source)) {
        sourceMap.set(source, { fieldsProvided: new Set() });
      }
      
      const entry = sourceMap.get(source)!;
      const fields = ['year', 'make', 'model', 'price', 'images', 'saleDate', 'location', 'damageType'];
      
      for (const field of fields) {
        const val = c[field] || c.raw?.[field];
        if (val !== undefined && val !== null && val !== '' && 
            !(Array.isArray(val) && val.length === 0)) {
          entry.fieldsProvided.add(field);
        }
      }
    }
    
    return Array.from(sourceMap.entries()).map(([source, data]) => ({
      source,
      status: data.fieldsProvided.size > 0 ? 'success' : 'empty',
      fieldsProvided: Array.from(data.fieldsProvided),
    }));
  }

  private buildStatusMessage(status: VinStatus, confidence: number, sourceCount: number): string {
    const confPercent = Math.round(confidence * 100);
    
    switch (status) {
      case VinStatus.ACTIVE_AUCTION:
        return `Активний аукціон (${confPercent}% впевненість, ${sourceCount} джерел)`;
      case VinStatus.AUCTION_FINISHED:
        return `Аукціон завершено (${confPercent}% впевненість, ${sourceCount} джерел)`;
      case VinStatus.HISTORICAL_RECORD:
        return `Історичний запис (${confPercent}% впевненість, ${sourceCount} джерел)`;
      case VinStatus.NOT_FOUND:
        return 'Дані не знайдено';
    }
  }

  private async buildResultFromDb(dbVehicle: any, startTime: number, historical = false): Promise<VinResolverResult> {
    const vehicle: VehicleData = {
      vin: dbVehicle.vin,
      year: dbVehicle.year,
      make: dbVehicle.make,
      model: dbVehicle.vehicleModel,
      title: dbVehicle.title,
      images: dbVehicle.images || [],
      location: dbVehicle.auctionLocation,
      lotNumber: dbVehicle.lotNumber,
      saleDate: dbVehicle.auctionDate,
      source: dbVehicle.source,
      mileage: dbVehicle.mileage,
      damageType: dbVehicle.damageType,
    };

    const status = historical 
      ? VinStatus.HISTORICAL_RECORD
      : this.determineStatus(vehicle, dbVehicle);

    const pricing = this.calculatePricing(vehicle, dbVehicle, 'UA');

    return {
      vin: dbVehicle.vin,
      status,
      confidence: dbVehicle.score ? dbVehicle.score / 100 : 0.7,
      vehicle,
      pricing,
      fieldConfidence: [],
      sourcesUsed: dbVehicle.sources || [dbVehicle.source],
      sourceBreakdown: [],
      searchDurationMs: Date.now() - startTime,
      timestamp: new Date(),
      message: `Дані з бази (${historical ? 'історичний запис' : 'актуальні'})`,
    };
  }

  private notFoundResult(vin: string, startTime: number, message: string): VinResolverResult {
    return {
      vin,
      status: VinStatus.NOT_FOUND,
      confidence: 0,
      vehicle: null,
      pricing: null,
      fieldConfidence: [],
      sourcesUsed: [],
      sourceBreakdown: [],
      searchDurationMs: Date.now() - startTime,
      timestamp: new Date(),
      message,
    };
  }

  private normalizeVin(vin: string): string | null {
    if (!vin) return null;
    const cleaned = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (cleaned.length !== 17) return null;
    return cleaned;
  }

  private async saveToDb(
    vin: string,
    vehicle: VehicleData,
    pricing: PricingData,
    status: VinStatus,
    confidence: number,
    candidates: any[]
  ): Promise<void> {
    try {
      await this.vehicleModel.findOneAndUpdate(
        { vin },
        {
          $set: {
            vin,
            title: vehicle.title,
            make: vehicle.make,
            vehicleModel: vehicle.model,
            year: vehicle.year,
            mileage: vehicle.mileage,
            images: vehicle.images,
            damageType: vehicle.damageType,
            auctionLocation: vehicle.location,
            lotNumber: vehicle.lotNumber,
            auctionDate: vehicle.saleDate,
            price: pricing?.auctionPrice,
            estimatedRetailValue: pricing?.marketPrice,
            score: Math.round(confidence * 100),
            sources: [...new Set(candidates.map(c => c.sourceName))],
            lastSyncedAt: new Date(),
            resolverStatus: status,
          },
        },
        { upsert: true, new: true }
      );
    } catch (error: any) {
      this.logger.warn(`[VinResolver] Failed to save to DB: ${error.message}`);
    }
  }
}
