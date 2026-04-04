/**
 * VIN Pricing Bridge Service
 * 
 * Розраховує:
 * - Ринкову ціну (market price)
 * - Максимальну ставку (max bid)
 * - Безпечну ставку (safe bid)
 * - Точку беззбитковості (break-even bid)
 * - Фінальну ціну під ключ (all-in price)
 * - Статус угоди (deal status)
 */

import { Injectable, Logger } from '@nestjs/common';
import { MergedVehicle } from '../interfaces/merged-vehicle.interface';
import { DealStatus } from '../dto/vin-resolver-response.dto';

export interface PricingResult {
  marketPrice: number;
  maxBid: number;
  safeBid: number;
  breakEvenBid: number;
  finalAllInPrice: number;
  dealStatus: DealStatus;
  platformMargin: number;
  deliveryCost: number;
  repairEstimate: number;
}

@Injectable()
export class VinPricingBridgeService {
  private readonly logger = new Logger(VinPricingBridgeService.name);

  // Constants
  private readonly AUCTION_FEE_PERCENT = 0.10;      // 10% аукціонний збір
  private readonly PLATFORM_MARGIN_PERCENT = 0.12;  // 12% маржа платформи
  private readonly BASE_DELIVERY_COST = 1500;       // $1500 базова доставка
  private readonly CUSTOMS_PERCENT = 0.10;          // 10% митo

  async calculate(vehicle: MergedVehicle | null): Promise<PricingResult | null> {
    if (!vehicle) {
      return null;
    }

    // Estimate market price
    const marketPrice = this.estimateMarketPrice(vehicle);
    
    if (marketPrice <= 0) {
      return null;
    }

    // Calculate costs
    const auctionFee = vehicle.price ? vehicle.price * this.AUCTION_FEE_PERCENT : 0;
    const deliveryCost = this.estimateDeliveryCost(vehicle.location);
    const customsCost = marketPrice * this.CUSTOMS_PERCENT;
    const repairEstimate = this.estimateRepairCost(vehicle, marketPrice);
    const platformMargin = marketPrice * this.PLATFORM_MARGIN_PERCENT;

    // Total additional costs
    const totalCosts = auctionFee + deliveryCost + customsCost + repairEstimate + platformMargin;

    // Break-even bid = Market Price - All Costs
    const breakEvenBid = Math.max(0, marketPrice - totalCosts);

    // Max bid = Market Price * 0.55 - Repair (more conservative)
    const maxBid = Math.max(0, marketPrice * 0.55 - repairEstimate);

    // Safe bid = Max bid * 0.9
    const safeBid = Math.round(maxBid * 0.9);

    // Final all-in price (if current auction price exists)
    const currentPrice = vehicle.price || maxBid;
    const finalAllInPrice = Math.round(
      currentPrice + auctionFee + deliveryCost + customsCost + repairEstimate + platformMargin
    );

    // Determine deal status
    const dealStatus = this.determineDealStatus(vehicle.price || 0, marketPrice, maxBid, breakEvenBid);

    this.logger.debug(
      `[Pricing] VIN ${vehicle.vin}: market=$${marketPrice}, maxBid=$${Math.round(maxBid)}, ` +
      `status=${dealStatus}`
    );

    return {
      marketPrice: Math.round(marketPrice),
      maxBid: Math.round(maxBid),
      safeBid,
      breakEvenBid: Math.round(breakEvenBid),
      finalAllInPrice,
      dealStatus,
      platformMargin: Math.round(platformMargin),
      deliveryCost: Math.round(deliveryCost),
      repairEstimate: Math.round(repairEstimate),
    };
  }

  private estimateMarketPrice(vehicle: MergedVehicle): number {
    // If we have actual price, estimate market based on salvage discount
    if (vehicle.price && vehicle.price > 0) {
      // Salvage vehicles are typically 40-60% of retail
      return Math.round(vehicle.price / 0.45);
    }

    // Estimate based on year/make
    if (!vehicle.year) {
      return 15000; // Default estimate
    }

    const currentYear = new Date().getFullYear();
    const age = currentYear - vehicle.year;

    // Base prices by make tier
    const premiumMakes = ['bmw', 'mercedes', 'audi', 'lexus', 'porsche', 'tesla', 'land rover', 'jaguar'];
    const midMakes = ['toyota', 'honda', 'mazda', 'subaru', 'volkswagen', 'hyundai', 'kia', 'nissan'];

    let basePrice = 25000; // Default

    if (vehicle.make) {
      const makeLower = vehicle.make.toLowerCase();
      if (premiumMakes.some(m => makeLower.includes(m))) {
        basePrice = 45000;
      } else if (midMakes.some(m => makeLower.includes(m))) {
        basePrice = 30000;
      }
    }

    // Depreciation: ~12% per year
    const depreciatedPrice = basePrice * Math.pow(0.88, age);

    // Salvage discount: 45% of market
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

    return depreciatedPrice * salvageDiscount * damageMultiplier * mileageMultiplier;
  }

  private estimateDeliveryCost(location: string | undefined): number {
    let cost = this.BASE_DELIVERY_COST;

    if (!location) return cost;

    const locationLower = location.toLowerCase();

    // West coast costs more for European delivery
    const westCoast = ['ca', 'california', 'wa', 'washington', 'or', 'oregon', 'az', 'arizona', 'nv', 'nevada'];
    if (westCoast.some(s => locationLower.includes(s))) {
      cost += 800;
    }

    // Texas/Gulf is closer to ports
    const gulfCoast = ['tx', 'texas', 'la', 'louisiana', 'fl', 'florida', 'ga', 'georgia'];
    if (gulfCoast.some(s => locationLower.includes(s))) {
      cost -= 200;
    }

    return Math.max(1000, cost);
  }

  private estimateRepairCost(vehicle: MergedVehicle, marketPrice: number): number {
    let repairMultiplier = 0.15; // Base 15% repair estimate

    if (vehicle.damageType) {
      const damageLower = vehicle.damageType.toLowerCase();
      if (damageLower.includes('front end')) repairMultiplier = 0.25;
      else if (damageLower.includes('rear end')) repairMultiplier = 0.20;
      else if (damageLower.includes('side')) repairMultiplier = 0.18;
      else if (damageLower.includes('flood')) repairMultiplier = 0.40;
      else if (damageLower.includes('fire')) repairMultiplier = 0.50;
      else if (damageLower.includes('mechanical')) repairMultiplier = 0.30;
      else if (damageLower.includes('hail')) repairMultiplier = 0.15;
      else if (damageLower.includes('minor')) repairMultiplier = 0.10;
    }

    return marketPrice * repairMultiplier;
  }

  private determineDealStatus(
    currentPrice: number,
    marketPrice: number,
    maxBid: number,
    breakEvenBid: number
  ): DealStatus {
    if (!currentPrice || !marketPrice) {
      return 'UNKNOWN';
    }

    const ratio = currentPrice / marketPrice;

    if (ratio < 0.35) return 'EXCELLENT_DEAL';
    if (ratio < 0.45) return 'GOOD_DEAL';
    if (ratio < 0.55) return 'FAIR_DEAL';
    if (ratio < 0.65) return 'RISKY';
    return 'OVERPRICED';
  }
}
