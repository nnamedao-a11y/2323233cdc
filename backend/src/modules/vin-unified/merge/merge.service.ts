/**
 * VIN Merge Service
 * 
 * Merges multiple extraction results into 3-layer response
 * 
 * Layer 1: Vehicle (official decode)
 * Layer 2: Auction (marketplace data)
 * Layer 3: History (damage, title, odometer)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ExtractedVehicle,
  VehicleLayerDto,
  AuctionLayerDto,
  HistoryLayerDto,
  ConfidenceLevel,
  SourceTier,
} from '../dto/vin.dto';

export interface MergeResult {
  vehicle: VehicleLayerDto;
  auction: AuctionLayerDto;
  history: HistoryLayerDto;
}

@Injectable()
export class VinMergeService {
  private readonly logger = new Logger(VinMergeService.name);

  /**
   * Merge extracted data into 3-layer structure
   */
  merge(targetVin: string, vehicles: ExtractedVehicle[]): MergeResult {
    // Separate by source tier for confidence
    const tier1 = vehicles.filter(v => v.sourceTier === 1);
    const tier2 = vehicles.filter(v => v.sourceTier === 2);
    const tier3 = vehicles.filter(v => v.sourceTier === 3);

    this.logger.debug(
      `[Merge] Processing ${vehicles.length} results: T1=${tier1.length}, T2=${tier2.length}, T3=${tier3.length}`
    );

    // Build each layer
    const vehicleLayer = this.buildVehicleLayer(vehicles);
    const auctionLayer = this.buildAuctionLayer(vehicles);
    const historyLayer = this.buildHistoryLayer(vehicles);

    this.logger.log(
      `[Merge] Result: vehicle=${vehicleLayer.confidence}, auction=${auctionLayer.confidence}, history=${historyLayer.confidence}`
    );

    return { vehicle: vehicleLayer, auction: auctionLayer, history: historyLayer };
  }

  /**
   * Build Layer 1: Vehicle (official decode)
   */
  private buildVehicleLayer(vehicles: ExtractedVehicle[]): VehicleLayerDto {
    // Prioritize NHTSA for official data
    const nhtsaData = vehicles.find(v => v.source === 'NHTSA');
    
    if (nhtsaData) {
      return {
        year: nhtsaData.year || null,
        make: nhtsaData.make || null,
        model: nhtsaData.model || null,
        trim: nhtsaData.trim,
        bodyType: nhtsaData.bodyType,
        confidence: 'confirmed',
        source: 'NHTSA',
      };
    }

    // Fallback to other sources with voting
    const year = this.voteNumber(vehicles, 'year');
    const make = this.voteString(vehicles, 'make');
    const model = this.voteString(vehicles, 'model');

    const hasData = !!(year || make || model);
    const confidence = this.calculateConfidence(vehicles, hasData);

    return {
      year,
      make,
      model,
      confidence,
      source: vehicles[0]?.source === 'NHTSA' ? 'NHTSA' : 'cache',
    };
  }

  /**
   * Build Layer 2: Auction (marketplace data)
   */
  private buildAuctionLayer(vehicles: ExtractedVehicle[]): AuctionLayerDto {
    // Prioritize Tier 1 auction sources
    const auctionSources = vehicles.filter(v =>
      ['IAAI', 'Copart', 'AutoBidMaster', 'SalvageReseller'].includes(v.source)
    );

    if (auctionSources.length === 0) {
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

    // Use highest priority auction source as primary
    const primary = auctionSources.sort((a, b) => b.confidence - a.confidence)[0];
    
    // Merge all auction data
    const allImages = this.mergeImages(auctionSources);
    const price = this.weightedPrice(auctionSources);

    // Determine status
    let status: AuctionLayerDto['status'] = null;
    if (primary.saleDate) {
      const saleDate = new Date(primary.saleDate);
      status = saleDate > new Date() ? 'upcoming' : 'sold';
    }

    const confidence = this.auctionConfidence(auctionSources);

    return {
      found: true,
      source: primary.source,
      lotNumber: primary.lotNumber || null,
      status,
      saleDate: primary.saleDate || null,
      location: this.cleanLocation(primary.location),
      currentBid: price,
      buyNowPrice: null,
      estimatedValue: price ? Math.round(price * 1.4) : null,
      damageType: primary.damageType || primary.primaryDamage || null,
      primaryDamage: primary.primaryDamage,
      secondaryDamage: primary.secondaryDamage,
      odometer: primary.mileage || null,
      odometerStatus: primary.odometerStatus as AuctionLayerDto['odometerStatus'],
      titleStatus: primary.titleStatus,
      keys: primary.keys as AuctionLayerDto['keys'],
      images: allImages,
      auctionUrl: primary.sourceUrl,
      confidence,
      allSources: [...new Set(auctionSources.map(v => v.source))],
    };
  }

  /**
   * Build Layer 3: History
   */
  private buildHistoryLayer(vehicles: ExtractedVehicle[]): HistoryLayerDto {
    // Aggregate history data from all sources
    const hasDamage = vehicles.some(v => v.damageType || v.primaryDamage);
    const hasOdometer = vehicles.some(v => v.mileage);

    if (!hasDamage && !hasOdometer) {
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

    // Check for specific damage types
    const allDamage = vehicles
      .map(v => [v.damageType, v.primaryDamage, v.secondaryDamage])
      .flat()
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const salvage = allDamage.includes('salvage') || vehicles.some(v =>
      v.titleStatus?.toLowerCase().includes('salvage')
    );
    const flood = allDamage.includes('flood') || allDamage.includes('water');
    const frame = allDamage.includes('frame');
    const airbag = allDamage.includes('airbag');

    // Get best odometer reading
    const odometerVehicles = vehicles.filter(v => v.mileage && v.mileage > 0);
    const latestOdometer = odometerVehicles.sort((a, b) =>
      new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime()
    )[0];

    return {
      found: true,
      titleRecords: salvage ? 1 : 0,
      accidents: hasDamage ? 1 : 0,
      owners: 0,
      serviceRecords: 0,
      salvageRecord: salvage,
      floodDamage: flood,
      frameDamage: frame,
      airbagDeployed: airbag,
      odometerRollback: false,
      lastOdometer: latestOdometer?.mileage,
      lastOdometerDate: latestOdometer?.extractedAt,
      confidence: this.historyConfidence(vehicles),
      source: vehicles[0]?.source,
    };
  }

  // ============ HELPER METHODS ============

  private voteString(vehicles: ExtractedVehicle[], field: keyof ExtractedVehicle): string | null {
    const votes = new Map<string, number>();

    for (const v of vehicles) {
      const value = v[field];
      if (typeof value !== 'string' || !value.trim()) continue;

      const normalized = value.trim().toUpperCase();
      const weight = v.confidence;
      votes.set(normalized, (votes.get(normalized) || 0) + weight);
    }

    if (votes.size === 0) return null;

    const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Return proper casing
    for (const v of vehicles) {
      const value = v[field];
      if (typeof value === 'string' && value.trim().toUpperCase() === winner) {
        return value.trim();
      }
    }

    return winner;
  }

  private voteNumber(vehicles: ExtractedVehicle[], field: keyof ExtractedVehicle): number | null {
    const votes = new Map<number, number>();

    for (const v of vehicles) {
      const value = v[field];
      if (typeof value !== 'number' || value <= 0) continue;

      votes.set(value, (votes.get(value) || 0) + v.confidence);
    }

    if (votes.size === 0) return null;
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  private weightedPrice(vehicles: ExtractedVehicle[]): number | null {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const v of vehicles) {
      if (typeof v.price !== 'number' || v.price <= 0) continue;
      const weight = v.confidence;
      weightedSum += v.price * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return null;
    return Math.round(weightedSum / totalWeight);
  }

  private mergeImages(vehicles: ExtractedVehicle[]): string[] {
    const seen = new Set<string>();
    const images: string[] = [];

    // Exclude patterns for UI elements
    const excludePatterns = [
      /on_boarding/i, /walkthrough/i, /sprite/i, /logo/i,
      /icon/i, /placeholder/i, /arrow/i, /button/i,
      /loading/i, /spinner/i, /bing\.com/i, /privacyoptions/i,
    ];

    for (const v of vehicles) {
      if (!v.images) continue;

      for (const img of v.images) {
        // Skip excluded patterns
        if (excludePatterns.some(p => p.test(img))) continue;

        // Skip tiny images or non-http
        if (!img.startsWith('http')) continue;

        // Normalize for dedup
        const normalized = this.normalizeImageUrl(img);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          images.push(img);
        }
      }
    }

    return images.slice(0, 30);
  }

  private normalizeImageUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  private cleanLocation(location?: string): string | null {
    if (!location) return null;

    // Clean up garbage from parsing
    const cleaned = location
      .replace(/^[^a-zA-Z]+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Must look like a location (contain state code or country)
    if (cleaned.length < 3 || cleaned.length > 100) return null;
    if (!/[A-Z]{2}/.test(cleaned) && !/[a-zA-Z]+/.test(cleaned)) return null;

    return cleaned;
  }

  private calculateConfidence(vehicles: ExtractedVehicle[], hasData: boolean): ConfidenceLevel {
    if (!hasData || vehicles.length === 0) return 'unavailable';

    const tier1Count = vehicles.filter(v => v.sourceTier === 1).length;
    const avgConfidence = vehicles.reduce((sum, v) => sum + v.confidence, 0) / vehicles.length;

    if (tier1Count > 0 && avgConfidence > 0.85) return 'confirmed';
    if (avgConfidence > 0.7) return 'probable';
    if (avgConfidence > 0.5) return 'weak';
    return 'unavailable';
  }

  private auctionConfidence(vehicles: ExtractedVehicle[]): ConfidenceLevel {
    if (vehicles.length === 0) return 'unavailable';

    const hasLotNumber = vehicles.some(v => v.lotNumber);
    const hasPrice = vehicles.some(v => v.price && v.price > 0);
    const hasImages = vehicles.some(v => v.images && v.images.length > 0);

    const score = (hasLotNumber ? 1 : 0) + (hasPrice ? 1 : 0) + (hasImages ? 1 : 0);

    if (score >= 3) return 'confirmed';
    if (score >= 2) return 'probable';
    if (score >= 1) return 'weak';
    return 'unavailable';
  }

  private historyConfidence(vehicles: ExtractedVehicle[]): ConfidenceLevel {
    const hasDamage = vehicles.some(v => v.damageType);
    const hasOdometer = vehicles.some(v => v.mileage);

    if (hasDamage && hasOdometer) return 'probable';
    if (hasDamage || hasOdometer) return 'weak';
    return 'unavailable';
  }
}
