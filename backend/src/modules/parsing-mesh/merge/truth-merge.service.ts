/**
 * Truth Merge Service
 * 
 * Злиття результатів з багатьох джерел в єдину "правду"
 * 
 * Merge Rules:
 * - VIN: exact match only
 * - lotNumber: exact, otherwise null
 * - title/year/make/model: majority + trust weighted
 * - saleDate: freshest from trusted source
 * - price: trusted + freshness weighted
 * - images: union + dedupe
 */

import { Injectable, Logger } from '@nestjs/common';
import { NormalizedVehicle, SourceConfig } from '../adapters/interfaces/vin-source-adapter.interface';
import { MergedVehicleDto } from '../dto/normalized-vehicle.dto';
import { SourceService } from '../sources/source.service';
import { cleanVin } from '../utils/vin.utils';

interface FieldVote {
  value: any;
  confidence: number;
  source: string;
  freshness: number;
}

@Injectable()
export class TruthMergeService {
  private readonly logger = new Logger(TruthMergeService.name);

  constructor(private readonly sourceService: SourceService) {}

  /**
   * Merge multiple vehicle results into single truth
   */
  async merge(vehicles: NormalizedVehicle[], targetVin?: string): Promise<MergedVehicleDto | null> {
    if (!vehicles || vehicles.length === 0) return null;

    // Filter to exact VIN matches only
    const cleanedTarget = targetVin ? cleanVin(targetVin) : null;
    const exactMatches = cleanedTarget
      ? vehicles.filter(v => cleanVin(v.vin) === cleanedTarget)
      : vehicles;

    if (exactMatches.length === 0) {
      this.logger.debug('No exact VIN matches found');
      return null;
    }

    this.logger.debug(`Merging ${exactMatches.length} results for VIN ${cleanedTarget || vehicles[0].vin}`);

    // Get source trust scores
    const sourceScores = await this.getSourceScores(exactMatches.map(v => v.source));

    // Sort by confidence weighted by source trust
    const ranked = exactMatches
      .map(v => ({
        ...v,
        effectiveScore: v.confidence * (sourceScores[v.source] || 0.5),
      }))
      .sort((a, b) => b.effectiveScore - a.effectiveScore);

    const best = ranked[0];

    // Merge each field using voting
    const merged: MergedVehicleDto = {
      // VIN is always from best match
      vin: cleanVin(best.vin),
      
      // Voted fields
      title: this.voteString(ranked, 'title', sourceScores),
      year: this.voteNumber(ranked, 'year', sourceScores),
      make: this.voteString(ranked, 'make', sourceScores),
      model: this.voteString(ranked, 'model', sourceScores),
      
      // Freshness-weighted fields
      price: this.voteFreshest(ranked, 'price', sourceScores),
      saleDate: this.voteFreshestDate(ranked, 'saleDate', sourceScores),
      
      // First non-null from trusted sources
      lotNumber: this.firstTrusted(ranked, 'lotNumber', sourceScores),
      mileage: this.firstTrusted(ranked, 'mileage', sourceScores),
      damage: this.firstTrusted(ranked, 'damage', sourceScores),
      location: this.firstTrusted(ranked, 'location', sourceScores),
      
      // Union fields
      images: this.unionImages(ranked),
      
      // Aggregated metadata
      source: best.source,
      sourceUrl: best.sourceUrl,
      isAuction: ranked.some(v => v.isAuction),
      confidence: this.calculateMergedConfidence(ranked, sourceScores),
      extractedAt: new Date(),
      
      // Merge metadata
      sourcesCount: exactMatches.length,
      allSources: [...new Set(exactMatches.map(v => v.source))],
      allSourceUrls: [...new Set(exactMatches.map(v => v.sourceUrl).filter(Boolean))],
      allImages: this.unionImages(ranked),
      priceHistory: this.buildPriceHistory(ranked),
      fieldConfidence: this.calculateFieldConfidence(ranked, sourceScores),
    };

    this.logger.log(
      `Merged ${exactMatches.length} sources for VIN ${merged.vin}: ` +
      `confidence=${merged.confidence}, images=${merged.allImages.length}`
    );

    return merged;
  }

  /**
   * Filter to exact VIN matches
   */
  filterExactMatches(vehicles: NormalizedVehicle[], targetVin: string): NormalizedVehicle[] {
    const cleanedTarget = cleanVin(targetVin);
    return vehicles.filter(v => cleanVin(v.vin) === cleanedTarget);
  }

  // ========== PRIVATE MERGE METHODS ==========

  private async getSourceScores(sources: string[]): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};
    
    for (const sourceName of [...new Set(sources)]) {
      const source = await this.sourceService.getByName(sourceName);
      scores[sourceName] = source?.trustScore || 0.5;
    }
    
    return scores;
  }

  private voteString(
    vehicles: NormalizedVehicle[],
    field: keyof NormalizedVehicle,
    sourceScores: Record<string, number>,
  ): string | undefined {
    const votes: Record<string, number> = {};
    
    for (const v of vehicles) {
      const value = v[field];
      if (value && typeof value === 'string' && value.trim()) {
        const normalized = value.trim().toLowerCase();
        const weight = v.confidence * (sourceScores[v.source] || 0.5);
        votes[normalized] = (votes[normalized] || 0) + weight;
      }
    }
    
    if (Object.keys(votes).length === 0) return undefined;
    
    // Return the value with highest weighted votes
    const winner = Object.entries(votes)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // Find original casing
    for (const v of vehicles) {
      const value = v[field];
      if (value && typeof value === 'string' && value.trim().toLowerCase() === winner) {
        return value.trim();
      }
    }
    
    return winner;
  }

  private voteNumber(
    vehicles: NormalizedVehicle[],
    field: keyof NormalizedVehicle,
    sourceScores: Record<string, number>,
  ): number | undefined {
    const votes: Record<number, number> = {};
    
    for (const v of vehicles) {
      const value = v[field];
      if (typeof value === 'number' && value > 0) {
        const weight = v.confidence * (sourceScores[v.source] || 0.5);
        votes[value] = (votes[value] || 0) + weight;
      }
    }
    
    if (Object.keys(votes).length === 0) return undefined;
    
    const winner = Object.entries(votes)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return parseInt(winner, 10);
  }

  private voteFreshest(
    vehicles: NormalizedVehicle[],
    field: keyof NormalizedVehicle,
    sourceScores: Record<string, number>,
  ): number | undefined {
    // For price, prefer most recent from trusted source
    const withValue = vehicles
      .filter(v => typeof v[field] === 'number' && (v[field] as number) > 0)
      .map(v => ({
        value: v[field] as number,
        trust: sourceScores[v.source] || 0.5,
        freshness: v.extractedAt ? v.extractedAt.getTime() : 0,
        score: (sourceScores[v.source] || 0.5) * 0.7 + 
               (v.extractedAt ? (v.extractedAt.getTime() / Date.now()) : 0) * 0.3,
      }))
      .sort((a, b) => b.score - a.score);
    
    return withValue[0]?.value;
  }

  private voteFreshestDate(
    vehicles: NormalizedVehicle[],
    field: keyof NormalizedVehicle,
    sourceScores: Record<string, number>,
  ): Date | undefined {
    const withValue = vehicles
      .filter(v => v[field] instanceof Date)
      .map(v => ({
        value: v[field] as Date,
        trust: sourceScores[v.source] || 0.5,
      }))
      .sort((a, b) => b.trust - a.trust);
    
    return withValue[0]?.value;
  }

  private firstTrusted(
    vehicles: NormalizedVehicle[],
    field: keyof NormalizedVehicle,
    sourceScores: Record<string, number>,
  ): any {
    // Already sorted by trust, return first non-null
    for (const v of vehicles) {
      const value = v[field];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
    return undefined;
  }

  private unionImages(vehicles: NormalizedVehicle[]): string[] {
    const seen = new Set<string>();
    const images: string[] = [];
    
    for (const v of vehicles) {
      if (!v.images) continue;
      
      for (const img of v.images) {
        // Normalize for dedup (remove query params, etc.)
        const normalized = img.split('?')[0].toLowerCase();
        
        if (!seen.has(normalized)) {
          seen.add(normalized);
          images.push(img);
        }
      }
    }
    
    // Limit total
    return images.slice(0, 50);
  }

  private buildPriceHistory(vehicles: NormalizedVehicle[]): { price: number; source: string; date: Date }[] {
    return vehicles
      .filter(v => typeof v.price === 'number' && v.price > 0)
      .map(v => ({
        price: v.price!,
        source: v.source,
        date: v.extractedAt || new Date(),
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private calculateMergedConfidence(
    vehicles: NormalizedVehicle[],
    sourceScores: Record<string, number>,
  ): number {
    if (vehicles.length === 0) return 0;
    
    // Weighted average of confidences
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const v of vehicles) {
      const weight = sourceScores[v.source] || 0.5;
      weightedSum += v.confidence * weight;
      totalWeight += weight;
    }
    
    const baseConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    // Bonus for multiple sources
    const sourceBonus = Math.min(0.15, vehicles.length * 0.03);
    
    return Number(Math.min(1, baseConfidence + sourceBonus).toFixed(3));
  }

  private calculateFieldConfidence(
    vehicles: NormalizedVehicle[],
    sourceScores: Record<string, number>,
  ): Record<string, number> {
    const fields = ['vin', 'title', 'price', 'saleDate', 'lotNumber', 'mileage', 'damage', 'images'];
    const result: Record<string, number> = {};
    
    for (const field of fields) {
      const withValue = vehicles.filter(v => {
        const val = v[field as keyof NormalizedVehicle];
        if (Array.isArray(val)) return val.length > 0;
        return val !== null && val !== undefined && val !== '';
      });
      
      if (withValue.length === 0) {
        result[field] = 0;
        continue;
      }
      
      // Calculate based on agreement and trust
      const totalTrust = withValue.reduce((sum, v) => sum + (sourceScores[v.source] || 0.5), 0);
      const coverage = withValue.length / vehicles.length;
      
      result[field] = Number((totalTrust / withValue.length * 0.7 + coverage * 0.3).toFixed(3));
    }
    
    return result;
  }
}
