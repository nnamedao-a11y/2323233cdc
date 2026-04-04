/**
 * VIN Price Service
 * 
 * Main service: VIN → Full Price Analysis
 * 
 * Об'єднує:
 * - VIN Parsing (дані про авто)
 * - Market Estimation (ринкова ціна)
 * - Cost Calculation (всі витрати)
 * - Bid Recommendations (max bid, break-even)
 * - Deal Status (GOOD/RISKY/BAD)
 */

import { Injectable, Logger } from '@nestjs/common';
import { VinOrchestratorService } from '../parsing-mesh/orchestrator/vin-orchestrator.service';
import { MarketEstimatorService, MarketEstimate, VehicleData } from './market-estimator.service';
import { CostCalculatorService, CostBreakdown, CostConfig } from './cost-calculator.service';
import { BidCalculatorService, BidRecommendation, DealStatus } from './bid-calculator.service';
import { NormalizedVehicle } from '../parsing-mesh/adapters/interfaces/vin-source-adapter.interface';

export interface VinPriceResult {
  success: boolean;
  vin: string;
  
  // Vehicle data
  vehicle: {
    title: string;
    make: string;
    model: string;
    year: number;
    mileage?: number;
    damage?: string;
    location?: string;
    images: string[];
    lotNumber?: string;
    auctionDate?: Date;
    confidence: number;
    sources: string[];
  };
  
  // Market analysis
  market: {
    estimatedPrice: number;
    priceRange: { min: number; max: number };
    confidence: number;
    source: string;
  };
  
  // Bid recommendations
  bid: BidRecommendation;
  
  // Cost breakdown (at max bid)
  costs: CostBreakdown;
  
  // Deal status
  dealStatus: {
    status: DealStatus;
    label: string;
    color: string;
  };
  
  // Manager assist
  managerAdvice: {
    action: string;
    script: string;
    urgency: 'high' | 'medium' | 'low';
  };
  
  // Metadata
  calculatedAt: Date;
  duration: number;
}

@Injectable()
export class VinPriceService {
  private readonly logger = new Logger(VinPriceService.name);

  constructor(
    private readonly vinOrchestrator: VinOrchestratorService,
    private readonly marketEstimator: MarketEstimatorService,
    private readonly costCalculator: CostCalculatorService,
    private readonly bidCalculator: BidCalculatorService,
  ) {}

  /**
   * Full VIN price analysis
   */
  async calculate(vin: string, currentBid?: number): Promise<VinPriceResult> {
    const startTime = Date.now();
    this.logger.log(`[VinPrice] Starting analysis for VIN: ${vin}`);

    try {
      // 1. Get vehicle data from parsing mesh
      const searchResult = await this.vinOrchestrator.search(vin);
      
      if (!searchResult.success || !searchResult.merged) {
        throw new Error('Vehicle data not found');
      }

      const vehicleData = this.normalizeVehicleData(searchResult.merged, vin);

      // 2. Estimate market price
      const marketEstimate = await this.marketEstimator.estimate({
        vin,
        make: vehicleData.make,
        model: vehicleData.model,
        year: vehicleData.year,
        mileage: vehicleData.mileage,
        damage: vehicleData.damage,
      });

      // 3. Calculate bid recommendations
      const bidRecommendation = this.bidCalculator.calculate({
        vehicle: {
          vin,
          make: vehicleData.make,
          model: vehicleData.model,
          year: vehicleData.year,
          mileage: vehicleData.mileage,
          damage: vehicleData.damage,
        },
        marketEstimate,
        currentBid,
      });

      // 4. Calculate full costs at max bid
      const costs = this.costCalculator.calculate({
        bidPrice: bidRecommendation.maxBid,
        vehicleYear: vehicleData.year,
        damage: vehicleData.damage,
        location: vehicleData.location,
      });

      // 5. Determine deal status
      const dealStatus = bidRecommendation.dealStatus || 
        this.bidCalculator.getDealStatus(
          currentBid || bidRecommendation.maxBid,
          bidRecommendation.maxBid,
          bidRecommendation.breakEvenBid,
          bidRecommendation.riskBid
        );

      // 6. Generate manager advice
      const managerAdvice = this.generateManagerAdvice(
        bidRecommendation,
        marketEstimate,
        dealStatus
      );

      return {
        success: true,
        vin,
        vehicle: vehicleData,
        market: {
          estimatedPrice: marketEstimate.estimatedPrice,
          priceRange: marketEstimate.priceRange,
          confidence: marketEstimate.confidence,
          source: marketEstimate.source,
        },
        bid: bidRecommendation,
        costs,
        dealStatus: {
          status: dealStatus,
          label: this.bidCalculator.getDealStatusLabel(dealStatus),
          color: this.bidCalculator.getDealStatusColor(dealStatus),
        },
        managerAdvice,
        calculatedAt: new Date(),
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error(`[VinPrice] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Quick estimate without full parsing
   */
  async quickEstimate(
    make: string,
    model: string,
    year: number,
    damage?: string,
    mileage?: number
  ): Promise<Partial<VinPriceResult>> {
    const vehicleData: VehicleData = {
      vin: 'QUICK_ESTIMATE',
      make,
      model,
      year,
      mileage,
      damage,
    };

    const marketEstimate = await this.marketEstimator.estimate(vehicleData);
    
    const bidRecommendation = this.bidCalculator.calculate({
      vehicle: vehicleData,
      marketEstimate,
    });

    return {
      success: true,
      vin: 'QUICK_ESTIMATE',
      market: {
        estimatedPrice: marketEstimate.estimatedPrice,
        priceRange: marketEstimate.priceRange,
        confidence: marketEstimate.confidence,
        source: marketEstimate.source,
      },
      bid: bidRecommendation,
    };
  }

  /**
   * Normalize vehicle data from parsing result
   */
  private normalizeVehicleData(merged: NormalizedVehicle, vin: string): VinPriceResult['vehicle'] {
    return {
      title: merged.title || `${merged.year || ''} ${merged.make || ''} ${merged.model || ''}`.trim(),
      make: merged.make || 'Unknown',
      model: merged.model || 'Unknown',
      year: merged.year || new Date().getFullYear(),
      mileage: merged.mileage ?? undefined,
      damage: merged.damage ?? undefined,
      location: merged.location ?? undefined,
      images: merged.images || [],
      lotNumber: merged.lotNumber ?? undefined,
      auctionDate: merged.saleDate ?? undefined,
      confidence: merged.confidence,
      sources: [merged.source],
    };
  }

  /**
   * Generate manager advice
   */
  private generateManagerAdvice(
    bid: BidRecommendation,
    market: MarketEstimate,
    status: DealStatus
  ): VinPriceResult['managerAdvice'] {
    const savings = market.estimatedPrice - bid.finalPrice;
    const savingsPercent = Math.round((savings / market.estimatedPrice) * 100);

    // Determine action and urgency
    let action: string;
    let script: string;
    let urgency: 'high' | 'medium' | 'low';

    switch (status) {
      case 'GOOD_DEAL':
        action = 'CLOSE NOW';
        urgency = 'high';
        script = `Це вигідна угода! Клієнт економить $${savings} (${savingsPercent}%) порівняно з ринком. ` +
          `Максимальна ставка $${bid.maxBid} — до цієї ціни є сенс. ` +
          `Фінальна ціна під ключ $${bid.finalPrice}.`;
        break;
        
      case 'OK_DEAL':
        action = 'CLOSE';
        urgency = 'high';
        script = `Нормальна угода. Клієнт заходить нижче ринку на $${savings}. ` +
          `Рекомендована ставка до $${bid.safeBid} — це безпечна ціна.`;
        break;
        
      case 'RISKY':
        action = 'NEGOTIATE';
        urgency = 'medium';
        script = `Ризикована ставка. Якщо ціна піде вище $${bid.riskBid} — це вже на межі. ` +
          `Рекомендую запропонувати знижку або чекати інший варіант.`;
        break;
        
      case 'OVERPRICED':
        action = 'WARN';
        urgency = 'low';
        script = `Завищена ціна. Вище $${bid.breakEvenBid} — це вже не вигідно. ` +
          `Краще розглянути альтернативи.`;
        break;
        
      default:
        action = 'AVOID';
        urgency = 'low';
        script = `Не рекомендую. При цій ціні угода буде збитковою.`;
    }

    return { action, script, urgency };
  }
}
