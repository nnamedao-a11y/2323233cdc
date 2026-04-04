/**
 * Deal Risk Service
 * 
 * Calculates risk score for a deal:
 * - Low confidence data
 * - Missing sale date
 * - Damage types
 * - Source count
 */

import { Injectable } from '@nestjs/common';

export interface RiskInput {
  confidence: number;
  saleDate?: string;
  damage?: string;
  sourceCount: number;
  mileage?: number;
  year?: number;
  isCleanTitle?: boolean;
}

export interface RiskResult {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: string[];
}

@Injectable()
export class DealRiskService {
  calculate(input: RiskInput): RiskResult {
    let risk = 0;
    const factors: string[] = [];

    // Confidence check
    if (input.confidence < 0.5) {
      risk += 35;
      factors.push('Very low data confidence (<50%)');
    } else if (input.confidence < 0.7) {
      risk += 20;
      factors.push('Low data confidence (<70%)');
    }

    // Source count
    if (input.sourceCount < 2) {
      risk += 25;
      factors.push('Limited sources (only 1)');
    } else if (input.sourceCount < 3) {
      risk += 10;
      factors.push('Few data sources (2)');
    }

    // Damage assessment
    if (input.damage) {
      const damageLower = input.damage.toLowerCase();
      if (damageLower.includes('total') || damageLower.includes('salvage')) {
        risk += 40;
        factors.push('Salvage/Total loss title');
      } else if (damageLower.includes('front')) {
        risk += 15;
        factors.push('Front-end damage');
      } else if (damageLower.includes('rear')) {
        risk += 10;
        factors.push('Rear-end damage');
      } else if (damageLower.includes('side')) {
        risk += 12;
        factors.push('Side damage');
      } else if (damageLower.includes('water') || damageLower.includes('flood')) {
        risk += 35;
        factors.push('Water/Flood damage');
      } else if (damageLower !== 'none' && damageLower !== 'clean') {
        risk += 8;
        factors.push('Minor damage reported');
      }
    }

    // Sale date
    if (!input.saleDate) {
      risk += 15;
      factors.push('No sale date available');
    }

    // High mileage
    if (input.mileage && input.year) {
      const age = new Date().getFullYear() - input.year;
      const avgMilesPerYear = input.mileage / Math.max(age, 1);
      if (avgMilesPerYear > 20000) {
        risk += 10;
        factors.push('High mileage for age');
      }
    }

    // Title status
    if (input.isCleanTitle === false) {
      risk += 20;
      factors.push('Non-clean title');
    }

    // Cap at 100
    risk = Math.min(risk, 100);

    const level = risk >= 50 ? 'high' : risk >= 25 ? 'medium' : 'low';

    return {
      riskScore: risk,
      riskLevel: level,
      factors,
    };
  }
}
