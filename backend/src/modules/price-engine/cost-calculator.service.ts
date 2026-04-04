/**
 * Cost Calculator Service
 * 
 * Розрахунок всіх витрат:
 * - Auction fees
 * - Delivery (USA → Port → Ukraine)
 * - Customs & duties
 * - Repair estimate
 * - Platform fee
 */

import { Injectable, Logger } from '@nestjs/common';

export interface CostBreakdown {
  auctionFee: number;
  buyerFee: number;
  environmentalFee: number;
  gatePass: number;
  delivery: {
    inland: number;
    ocean: number;
    port: number;
    total: number;
  };
  customs: {
    duty: number;
    vat: number;
    excise: number;
    brokerFee: number;
    total: number;
  };
  repair: {
    estimated: number;
    range: { min: number; max: number };
  };
  platformFee: number;
  insurance: number;
  totalCosts: number;
}

export interface CostConfig {
  bidPrice: number;
  vehicleYear: number;
  engineVolume?: number; // in liters
  fuelType?: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
  damage?: string;
  location?: string;
  destinationPort?: string;
}

// Auction fee structure (Copart/IAAI style)
const AUCTION_FEES = [
  { max: 100, fee: 25 },
  { max: 200, fee: 50 },
  { max: 300, fee: 75 },
  { max: 400, fee: 110 },
  { max: 500, fee: 125 },
  { max: 600, fee: 140 },
  { max: 700, fee: 165 },
  { max: 800, fee: 185 },
  { max: 900, fee: 200 },
  { max: 1000, fee: 225 },
  { max: 1200, fee: 250 },
  { max: 1400, fee: 280 },
  { max: 1600, fee: 315 },
  { max: 1800, fee: 345 },
  { max: 2000, fee: 375 },
  { max: 2500, fee: 425 },
  { max: 3000, fee: 475 },
  { max: 4000, fee: 525 },
  { max: 5000, fee: 575 },
  { max: 6000, fee: 625 },
  { max: 7500, fee: 700 },
  { max: 10000, fee: 775 },
  { max: 15000, fee: 875 },
  { max: 20000, fee: 950 },
  { max: 25000, fee: 1000 },
  { max: Infinity, fee: 1100 },
];

// Repair estimates by damage type
const REPAIR_ESTIMATES: Record<string, { min: number; max: number; avg: number }> = {
  'none': { min: 0, max: 500, avg: 200 },
  'minor': { min: 500, max: 2000, avg: 1000 },
  'front': { min: 2000, max: 8000, avg: 4500 },
  'rear': { min: 1500, max: 6000, avg: 3500 },
  'side': { min: 1800, max: 7000, avg: 4000 },
  'rollover': { min: 8000, max: 20000, avg: 12000 },
  'flood': { min: 3000, max: 15000, avg: 8000 },
  'fire': { min: 5000, max: 25000, avg: 15000 },
  'mechanical': { min: 1000, max: 5000, avg: 2500 },
  'hail': { min: 1500, max: 5000, avg: 3000 },
  'vandalism': { min: 500, max: 3000, avg: 1500 },
  'unknown': { min: 2000, max: 8000, avg: 4000 },
};

// Inland delivery by region
const INLAND_DELIVERY: Record<string, number> = {
  'california': 500,
  'texas': 600,
  'florida': 700,
  'new york': 650,
  'new jersey': 600,
  'georgia': 650,
  'pennsylvania': 600,
  'ohio': 550,
  'illinois': 600,
  'michigan': 550,
  'default': 600,
};

@Injectable()
export class CostCalculatorService {
  private readonly logger = new Logger(CostCalculatorService.name);

  // Default config
  private readonly BUYER_FEE = 400;
  private readonly ENVIRONMENTAL_FEE = 25;
  private readonly GATE_PASS = 100;
  private readonly OCEAN_FREIGHT = 1200; // USA → Europe
  private readonly PORT_HANDLING = 350;
  private readonly BROKER_FEE = 200;
  private readonly INSURANCE_RATE = 0.015; // 1.5% of value
  private readonly PLATFORM_FEE_RATE = 0.05; // 5% of total

  /**
   * Calculate all costs
   */
  calculate(config: CostConfig): CostBreakdown {
    this.logger.debug(`[CostCalculator] Calculating costs for bid $${config.bidPrice}`);

    // 1. Auction fees
    const auctionFee = this.calculateAuctionFee(config.bidPrice);
    const buyerFee = this.BUYER_FEE;
    const environmentalFee = this.ENVIRONMENTAL_FEE;
    const gatePass = this.GATE_PASS;

    // 2. Delivery
    const delivery = this.calculateDelivery(config);

    // 3. Customs
    const customs = this.calculateCustoms(config);

    // 4. Repair estimate
    const repair = this.calculateRepair(config.damage);

    // 5. Insurance
    const vehicleValue = config.bidPrice + auctionFee + delivery.total;
    const insurance = Math.round(vehicleValue * this.INSURANCE_RATE);

    // 6. Platform fee (on total without platform fee)
    const subtotal = config.bidPrice + auctionFee + buyerFee + environmentalFee + gatePass 
      + delivery.total + customs.total + repair.estimated + insurance;
    const platformFee = Math.round(subtotal * this.PLATFORM_FEE_RATE);

    // 7. Total
    const totalCosts = subtotal + platformFee;

    return {
      auctionFee,
      buyerFee,
      environmentalFee,
      gatePass,
      delivery,
      customs,
      repair,
      platformFee,
      insurance,
      totalCosts,
    };
  }

  /**
   * Calculate costs without bid (for max bid calculation)
   */
  calculateWithoutBid(config: Omit<CostConfig, 'bidPrice'>): number {
    // Estimate with average bid
    const estimateBid = 5000;
    const costs = this.calculate({ ...config, bidPrice: estimateBid });
    
    // Return fixed costs (not dependent on bid price)
    return costs.totalCosts - estimateBid - costs.auctionFee;
  }

  /**
   * Calculate auction fee based on price
   */
  private calculateAuctionFee(bidPrice: number): number {
    for (const tier of AUCTION_FEES) {
      if (bidPrice <= tier.max) {
        return tier.fee;
      }
    }
    return AUCTION_FEES[AUCTION_FEES.length - 1].fee;
  }

  /**
   * Calculate delivery costs
   */
  private calculateDelivery(config: CostConfig): CostBreakdown['delivery'] {
    // Inland delivery
    const location = config.location?.toLowerCase() || 'default';
    let inland = INLAND_DELIVERY['default'];
    
    for (const [region, cost] of Object.entries(INLAND_DELIVERY)) {
      if (location.includes(region)) {
        inland = cost;
        break;
      }
    }

    // Ocean freight
    const ocean = this.OCEAN_FREIGHT;

    // Port handling
    const port = this.PORT_HANDLING;

    return {
      inland,
      ocean,
      port,
      total: inland + ocean + port,
    };
  }

  /**
   * Calculate customs duties (Ukraine example)
   * 
   * Формула: Акциз + Мито + ПДВ
   * - Акциз = об'єм двигуна × ставка × вік
   * - Мито = 10% від вартості
   * - ПДВ = 20% від (вартість + мито + акциз)
   */
  private calculateCustoms(config: CostConfig): CostBreakdown['customs'] {
    const vehicleValue = config.bidPrice;
    const engineVolume = config.engineVolume || 2.0; // liters
    const vehicleAge = new Date().getFullYear() - config.vehicleYear;
    const fuelType = config.fuelType || 'gasoline';

    // Electric cars have lower customs
    if (fuelType === 'electric') {
      const duty = 0;
      const excise = 0;
      const vat = Math.round(vehicleValue * 0.20);
      return {
        duty,
        vat,
        excise,
        brokerFee: this.BROKER_FEE,
        total: duty + vat + excise + this.BROKER_FEE,
      };
    }

    // Excise tax calculation (Ukraine formula)
    // Ставка = базова ставка × коефіцієнт віку × об'єм двигуна
    let exciseRate = fuelType === 'diesel' ? 75 : 50; // EUR per 1000cc
    if (vehicleAge > 15) exciseRate *= 40;
    else if (vehicleAge > 10) exciseRate *= 20;
    else if (vehicleAge > 5) exciseRate *= 10;
    else if (vehicleAge > 1) exciseRate *= 5;
    else exciseRate *= 1;

    const excise = Math.round(exciseRate * engineVolume);

    // Duty = 10%
    const duty = Math.round(vehicleValue * 0.10);

    // VAT = 20% of (value + duty + excise)
    const vat = Math.round((vehicleValue + duty + excise) * 0.20);

    return {
      duty,
      vat,
      excise,
      brokerFee: this.BROKER_FEE,
      total: duty + vat + excise + this.BROKER_FEE,
    };
  }

  /**
   * Calculate repair estimate
   */
  private calculateRepair(damage?: string): CostBreakdown['repair'] {
    if (!damage) {
      return {
        estimated: REPAIR_ESTIMATES['unknown'].avg,
        range: { min: REPAIR_ESTIMATES['unknown'].min, max: REPAIR_ESTIMATES['unknown'].max },
      };
    }

    const lowerDamage = damage.toLowerCase();
    let estimate = REPAIR_ESTIMATES['unknown'];

    for (const [type, costs] of Object.entries(REPAIR_ESTIMATES)) {
      if (lowerDamage.includes(type)) {
        estimate = costs;
        break;
      }
    }

    return {
      estimated: estimate.avg,
      range: { min: estimate.min, max: estimate.max },
    };
  }
}
