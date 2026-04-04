/**
 * VIN Scoring Service
 * 
 * Calculates deal score and recommendations
 */

import { Injectable, Logger } from '@nestjs/common';
import { ScoringDto, DealScore } from '../dto/vin.dto';

interface ScoringInput {
  price?: number | null;
  year?: number | null;
  make?: string | null;
  damageType?: string | null;
  location?: string | null;
}

@Injectable()
export class VinScoringService {
  private readonly logger = new Logger(VinScoringService.name);

  /**
   * Calculate deal score and recommendations
   */
  calculate(input: ScoringInput): ScoringDto {
    const price = input.price;
    
    if (!price || price <= 0) {
      return {
        dealScore: 'RISK',
        recommendation: 'Ціна невідома. Потрібна консультація менеджера.',
      };
    }

    const marketPrice = this.estimateMarketPrice(input);
    const safeBid = Math.round(marketPrice * 0.6);
    const maxBid = Math.round(marketPrice * 0.75);
    const breakEvenBid = Math.round(marketPrice * 0.85);
    const platformMargin = Math.round(price * 0.15);
    const deliveryCost = this.estimateDeliveryCost(input.location);
    const repairCost = this.estimateRepairCost(input.damageType);
    const finalPrice = price + platformMargin + deliveryCost + repairCost;
    const profitPotential = marketPrice - finalPrice;
    const dealScore = this.calculateDealScore(price, marketPrice, profitPotential);
    const recommendation = this.generateRecommendation(dealScore, profitPotential);

    return {
      dealScore,
      marketPrice,
      safeBid,
      maxBid,
      breakEvenBid,
      finalPrice,
      platformMargin,
      profitPotential,
      repairEstimate: repairCost,
      deliveryEstimate: deliveryCost,
      recommendation,
    };
  }

  private estimateMarketPrice(input: ScoringInput): number {
    const year = input.year || 2020;
    const age = new Date().getFullYear() - year;
    
    let basePrice = 50000;
    const premiumMakes = ['bmw', 'mercedes', 'audi', 'lexus', 'porsche', 'tesla'];
    const make = input.make?.toLowerCase() || '';
    
    if (premiumMakes.some(m => make.includes(m))) {
      basePrice = 70000;
    }
    
    const depreciation = Math.min(0.7, age * 0.15);
    let marketPrice = basePrice * (1 - depreciation);
    
    if (input.damageType) {
      const damage = input.damageType.toLowerCase();
      if (damage.includes('front') || damage.includes('rear')) {
        marketPrice *= 0.7;
      } else if (damage.includes('flood') || damage.includes('fire')) {
        marketPrice *= 0.4;
      } else if (damage.includes('mechanical')) {
        marketPrice *= 0.6;
      } else {
        marketPrice *= 0.75;
      }
    }
    
    if (input.price && input.price > 0) {
      marketPrice = Math.max(marketPrice, input.price * 1.6);
    }
    
    return Math.round(marketPrice);
  }

  private estimateDeliveryCost(location?: string | null): number {
    if (!location) return 2500;
    const loc = location.toLowerCase();
    
    if (loc.includes('california') || loc.includes('ca')) return 3000;
    if (loc.includes('new jersey') || loc.includes('nj') || loc.includes('new york')) return 2200;
    if (loc.includes('texas') || loc.includes('tx')) return 2600;
    
    return 2500;
  }

  private estimateRepairCost(damageType?: string | null): number {
    if (!damageType) return 2000;
    const damage = damageType.toLowerCase();
    
    if (damage.includes('front end')) return 3500;
    if (damage.includes('rear end')) return 2500;
    if (damage.includes('side')) return 2000;
    if (damage.includes('flood')) return 5000;
    if (damage.includes('fire')) return 6000;
    if (damage.includes('mechanical')) return 3000;
    if (damage.includes('hail')) return 1500;
    
    return 2000;
  }

  private calculateDealScore(price: number, marketPrice: number, profitPotential: number): DealScore {
    const priceRatio = price / marketPrice;
    
    if (priceRatio <= 0.5 && profitPotential > 5000) return 'GOOD';
    if (priceRatio <= 0.65 && profitPotential > 2000) return 'FAIR';
    if (priceRatio <= 0.8 && profitPotential > 0) return 'RISK';
    
    return 'BAD';
  }

  private generateRecommendation(score: DealScore, profitPotential: number): string {
    switch (score) {
      case 'GOOD':
        return `Відмінна угода! Потенційний прибуток ~$${profitPotential.toLocaleString()}. Рекомендуємо.`;
      case 'FAIR':
        return `Нормальна угода. Прибуток ~$${profitPotential.toLocaleString()}. Варто розглянути.`;
      case 'RISK':
        return `Ризикована угода. Прибуток ~$${profitPotential.toLocaleString()}. Потрібна оцінка.`;
      case 'BAD':
        return `Невигідна угода. Збиток ~$${Math.abs(profitPotential).toLocaleString()}. Не рекомендуємо.`;
    }
  }
}
