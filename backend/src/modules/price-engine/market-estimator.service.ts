/**
 * Market Estimator Service
 * 
 * Оцінка ринкової ціни авто на основі:
 * - Історичних продажів
 * - Схожих авто
 * - Аукціонних даних
 * - Adjustments (mileage, damage, year)
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PriceHistory, PriceHistoryDocument } from './schemas/price-history.schema';
import { MarketData, MarketDataDocument } from './schemas/market-data.schema';

export interface VehicleData {
  vin: string;
  make: string;
  model: string;
  year: number;
  mileage?: number;
  damage?: string;
  condition?: string;
}

export interface MarketEstimate {
  estimatedPrice: number;
  priceRange: { min: number; max: number };
  confidence: number;
  adjustments: {
    base: number;
    mileage: number;
    damage: number;
    age: number;
    total: number;
  };
  marketData: {
    avgPrice: number;
    medianPrice: number;
    sampleSize: number;
    avgAuctionPrice: number;
  };
  source: string;
}

// Base prices for popular makes (fallback)
const BASE_PRICES: Record<string, Record<string, number>> = {
  'TOYOTA': { 'CAMRY': 25000, 'COROLLA': 20000, 'RAV4': 30000, 'HIGHLANDER': 38000 },
  'HONDA': { 'ACCORD': 26000, 'CIVIC': 22000, 'CR-V': 30000, 'PILOT': 38000 },
  'BMW': { '3 SERIES': 42000, '5 SERIES': 55000, 'X3': 48000, 'X5': 62000, '328I': 35000 },
  'MERCEDES-BENZ': { 'C-CLASS': 45000, 'E-CLASS': 58000, 'GLC': 52000, 'GLE': 65000 },
  'CHEVROLET': { 'CAMARO': 35000, 'MALIBU': 24000, 'EQUINOX': 28000, 'TAHOE': 55000, 'CAVALIER': 8000 },
  'FORD': { 'MUSTANG': 38000, 'F-150': 45000, 'EXPLORER': 40000, 'ESCAPE': 28000 },
  'TESLA': { 'MODEL S': 85000, 'MODEL 3': 45000, 'MODEL X': 95000, 'MODEL Y': 55000 },
  'AUDI': { 'A4': 42000, 'A6': 55000, 'Q5': 48000, 'Q7': 62000 },
  'LEXUS': { 'ES': 42000, 'RX': 48000, 'NX': 42000, 'GX': 58000 },
  'NISSAN': { 'ALTIMA': 25000, 'MAXIMA': 35000, 'ROGUE': 28000, 'PATHFINDER': 38000 },
};

// Damage multipliers
const DAMAGE_MULTIPLIERS: Record<string, number> = {
  'none': 1.0,
  'minor': 0.85,
  'moderate': 0.70,
  'front': 0.65,
  'rear': 0.70,
  'side': 0.68,
  'rollover': 0.50,
  'flood': 0.45,
  'fire': 0.35,
  'theft': 0.55,
  'vandalism': 0.75,
  'hail': 0.80,
  'mechanical': 0.60,
  'unknown': 0.65,
};

@Injectable()
export class MarketEstimatorService {
  private readonly logger = new Logger(MarketEstimatorService.name);

  constructor(
    @InjectModel(PriceHistory.name) private priceHistoryModel: Model<PriceHistoryDocument>,
    @InjectModel(MarketData.name) private marketDataModel: Model<MarketDataDocument>,
  ) {}

  /**
   * Estimate market price for a vehicle
   */
  async estimate(vehicle: VehicleData): Promise<MarketEstimate> {
    this.logger.log(`[MarketEstimator] Estimating price for ${vehicle.year} ${vehicle.make} ${vehicle.model}`);

    // 1. Try to get cached market data
    let marketData = await this.getMarketData(vehicle.make, vehicle.model, vehicle.year);

    // 2. If no data, use base prices + depreciation
    if (!marketData || marketData.sampleSize < 3) {
      marketData = this.calculateFallbackMarketData(vehicle);
    }

    // 3. Calculate base price
    const basePrice = marketData.medianPrice || marketData.avgPrice;

    // 4. Apply adjustments
    const adjustments = this.calculateAdjustments(vehicle, basePrice, marketData);

    // 5. Calculate final estimate
    const estimatedPrice = Math.max(1000, basePrice + adjustments.total);

    // 6. Calculate price range
    const priceRange = {
      min: Math.round(estimatedPrice * 0.85),
      max: Math.round(estimatedPrice * 1.15),
    };

    // 7. Calculate confidence
    const confidence = this.calculateConfidence(marketData, vehicle);

    return {
      estimatedPrice: Math.round(estimatedPrice),
      priceRange,
      confidence,
      adjustments: {
        base: basePrice,
        mileage: adjustments.mileage,
        damage: adjustments.damage,
        age: adjustments.age,
        total: adjustments.total,
      },
      marketData: {
        avgPrice: marketData.avgPrice,
        medianPrice: marketData.medianPrice,
        sampleSize: marketData.sampleSize,
        avgAuctionPrice: marketData.avgAuctionPrice,
      },
      source: marketData.sampleSize > 0 ? 'historical_data' : 'base_estimate',
    };
  }

  /**
   * Get market data from DB
   */
  private async getMarketData(make: string, model: string, year: number): Promise<MarketData | null> {
    const normalizedMake = make?.toUpperCase().trim();
    const normalizedModel = model?.toUpperCase().trim();

    return this.marketDataModel.findOne({
      make: normalizedMake,
      model: normalizedModel,
      year,
    }).exec();
  }

  /**
   * Calculate fallback market data from base prices
   */
  private calculateFallbackMarketData(vehicle: VehicleData): MarketData {
    const normalizedMake = vehicle.make?.toUpperCase().trim() || '';
    const normalizedModel = vehicle.model?.toUpperCase().trim() || '';
    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - (vehicle.year || currentYear);

    // Get base price
    let basePrice = 25000; // default

    if (BASE_PRICES[normalizedMake]) {
      // Find matching model
      for (const [modelKey, price] of Object.entries(BASE_PRICES[normalizedMake])) {
        if (normalizedModel.includes(modelKey) || modelKey.includes(normalizedModel)) {
          basePrice = price;
          break;
        }
      }
    }

    // Apply depreciation (15% first year, 10% subsequent years)
    let depreciatedPrice = basePrice;
    if (vehicleAge > 0) {
      depreciatedPrice = basePrice * 0.85; // First year
      for (let i = 1; i < vehicleAge && i < 15; i++) {
        depreciatedPrice *= 0.90; // Subsequent years
      }
    }

    return {
      make: normalizedMake,
      model: normalizedModel,
      year: vehicle.year,
      avgPrice: Math.round(depreciatedPrice),
      medianPrice: Math.round(depreciatedPrice),
      minPrice: Math.round(depreciatedPrice * 0.7),
      maxPrice: Math.round(depreciatedPrice * 1.3),
      priceStdDev: Math.round(depreciatedPrice * 0.15),
      avgAuctionPrice: Math.round(depreciatedPrice * 0.55), // Auction ~55% of retail
      avgSoldPrice: Math.round(depreciatedPrice * 0.60),
      sampleSize: 0,
      soldCount: 0,
      mileageAdjustment: { perMile: -0.05, avgMileage: 12000 * vehicleAge },
      damageAdjustment: DAMAGE_MULTIPLIERS,
      lastUpdated: new Date(),
      confidence: 0.4,
    } as MarketData;
  }

  /**
   * Calculate price adjustments
   */
  private calculateAdjustments(
    vehicle: VehicleData, 
    basePrice: number,
    marketData: MarketData
  ): { mileage: number; damage: number; age: number; total: number } {
    let mileageAdj = 0;
    let damageAdj = 0;
    let ageAdj = 0;

    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - (vehicle.year || currentYear);

    // 1. Mileage adjustment
    if (vehicle.mileage && marketData.mileageAdjustment?.avgMileage) {
      const avgMileage = marketData.mileageAdjustment.avgMileage || (12000 * vehicleAge);
      const mileageDiff = vehicle.mileage - avgMileage;
      const perMile = marketData.mileageAdjustment.perMile || -0.05;
      mileageAdj = Math.round(mileageDiff * perMile);
      // Cap mileage adjustment at ±30%
      mileageAdj = Math.max(-basePrice * 0.3, Math.min(basePrice * 0.3, mileageAdj));
    }

    // 2. Damage adjustment
    if (vehicle.damage) {
      const damageType = vehicle.damage.toLowerCase();
      let multiplier = 1.0;

      for (const [key, value] of Object.entries(DAMAGE_MULTIPLIERS)) {
        if (damageType.includes(key)) {
          multiplier = Math.min(multiplier, value);
        }
      }

      damageAdj = Math.round(basePrice * (multiplier - 1));
    }

    // 3. Age adjustment (already factored in base, but add for very old/new)
    if (vehicleAge <= 1) {
      ageAdj = Math.round(basePrice * 0.05); // Newer cars premium
    } else if (vehicleAge > 10) {
      ageAdj = Math.round(basePrice * -0.05); // Older cars discount
    }

    return {
      mileage: mileageAdj,
      damage: damageAdj,
      age: ageAdj,
      total: mileageAdj + damageAdj + ageAdj,
    };
  }

  /**
   * Calculate estimate confidence
   */
  private calculateConfidence(marketData: MarketData, vehicle: VehicleData): number {
    let confidence = marketData.confidence || 0.4;

    // More samples = higher confidence
    if (marketData.sampleSize >= 50) confidence = Math.min(confidence + 0.3, 0.95);
    else if (marketData.sampleSize >= 20) confidence = Math.min(confidence + 0.2, 0.85);
    else if (marketData.sampleSize >= 10) confidence = Math.min(confidence + 0.1, 0.75);

    // Known damage = lower confidence
    if (vehicle.damage) {
      confidence *= 0.85;
    }

    // Missing mileage = lower confidence
    if (!vehicle.mileage) {
      confidence *= 0.9;
    }

    return Number(confidence.toFixed(2));
  }

  /**
   * Update market data with new sale
   */
  async recordSale(vehicle: VehicleData, soldPrice: number, auctionPrice?: number): Promise<void> {
    const normalizedMake = vehicle.make?.toUpperCase().trim();
    const normalizedModel = vehicle.model?.toUpperCase().trim();

    // Save to history
    await this.priceHistoryModel.create({
      vin: vehicle.vin,
      make: normalizedMake,
      model: normalizedModel,
      year: vehicle.year,
      soldPrice,
      auctionPrice,
      mileage: vehicle.mileage,
      damage: vehicle.damage,
      auctionDate: new Date(),
    });

    // Update aggregated market data
    await this.updateMarketData(normalizedMake, normalizedModel, vehicle.year);
  }

  /**
   * Update aggregated market data
   */
  private async updateMarketData(make: string, model: string, year: number): Promise<void> {
    const history = await this.priceHistoryModel.find({
      make,
      model,
      year,
      soldPrice: { $gt: 0 },
    }).sort({ auctionDate: -1 }).limit(100).exec();

    if (history.length === 0) return;

    const prices = history.map(h => h.soldPrice).filter(p => p > 0);
    const auctionPrices = history.map(h => h.auctionPrice).filter(p => p && p > 0);
    const mileages = history.map(h => h.mileage).filter(m => m && m > 0);

    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];

    await this.marketDataModel.findOneAndUpdate(
      { make, model, year },
      {
        avgPrice: Math.round(avgPrice),
        medianPrice: Math.round(medianPrice),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        avgAuctionPrice: auctionPrices.length > 0 
          ? Math.round(auctionPrices.reduce((a, b) => a + b, 0) / auctionPrices.length)
          : 0,
        sampleSize: prices.length,
        soldCount: history.length,
        mileageAdjustment: {
          avgMileage: mileages.length > 0 
            ? Math.round(mileages.reduce((a, b) => a + b, 0) / mileages.length)
            : 0,
          perMile: -0.05,
        },
        lastUpdated: new Date(),
        confidence: Math.min(0.95, 0.4 + prices.length * 0.01),
      },
      { upsert: true }
    );
  }
}
