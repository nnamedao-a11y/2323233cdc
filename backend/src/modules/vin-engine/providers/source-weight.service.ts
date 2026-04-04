/**
 * Source Weight Service
 * 
 * Керування вагами джерел для ранжування результатів
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class SourceWeightService {
  private readonly weights: Record<string, number> = {
    // Local sources - highest trust
    local_db: 1.0,
    
    // Official auction sources
    copart: 0.95,
    iaai: 0.95,
    manheim: 0.90,
    
    // Aggregators
    autobidmaster: 0.85,
    salvagebid: 0.85,
    bidfax: 0.80,
    poctra: 0.75,
    stat_vin: 0.80,
    
    // Competitor/public sources
    competitor_default: 0.70,
    aggregator_default: 0.75,
    
    // Web search fallback
    web_search_default: 0.55,
    vin_search: 0.50,
  };

  getWeight(sourceName: string): number {
    if (!sourceName) return 0.5;
    const normalized = sourceName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return this.weights[normalized] ?? 0.5;
  }

  setWeight(sourceName: string, weight: number): void {
    const normalized = sourceName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    this.weights[normalized] = Math.max(0, Math.min(1, weight));
  }

  getAllWeights(): Record<string, number> {
    return { ...this.weights };
  }
}
