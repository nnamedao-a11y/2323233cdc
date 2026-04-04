/**
 * VIN Merge Service
 * 
 * Merges data from multiple extraction results into best version
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExtractedData } from './extractor.service';

export interface MergedVinData {
  vin: string;
  title: string;
  price: number | null;
  images: string[];
  saleDate: Date | null;
  lotNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  damageType: string | null;
  location: string | null;
  sources: string[];
  sourceUrls: string[];
  dataQuality: number;
}

@Injectable()
export class VinMergeService {
  private readonly logger = new Logger(VinMergeService.name);

  /**
   * Merge multiple extraction results into single best result
   */
  merge(results: ExtractedData[], targetVin: string): MergedVinData | null {
    // Filter results with matching VIN
    const validResults = results.filter(r => 
      r.vin && r.vin.toUpperCase() === targetVin.toUpperCase()
    );

    if (validResults.length === 0) {
      // Try with results that have high confidence even without VIN match
      const highConfResults = results.filter(r => r.confidence >= 0.5);
      if (highConfResults.length === 0) {
        this.logger.warn(`No valid results to merge for VIN ${targetVin}`);
        return null;
      }
      validResults.push(...highConfResults);
    }

    // Sort by confidence
    validResults.sort((a, b) => b.confidence - a.confidence);

    this.logger.log(`Merging ${validResults.length} results for VIN ${targetVin}`);

    // Start with best result
    const best = validResults[0];
    
    const merged: MergedVinData = {
      vin: targetVin.toUpperCase(),
      title: best.title || '',
      price: best.price,
      images: [...best.images],
      saleDate: best.saleDate ? new Date(best.saleDate) : null,
      lotNumber: best.lotNumber,
      make: best.make,
      model: best.model,
      year: best.year,
      mileage: best.mileage,
      damageType: best.damageType,
      location: best.location,
      sources: [best.source],
      sourceUrls: [best.sourceUrl],
      dataQuality: 0,
    };

    // Merge in data from other results
    for (let i = 1; i < validResults.length; i++) {
      const r = validResults[i];

      // Fill missing fields
      if (!merged.title && r.title) merged.title = r.title;
      if (!merged.price && r.price) merged.price = r.price;
      if (!merged.saleDate && r.saleDate) merged.saleDate = new Date(r.saleDate);
      if (!merged.lotNumber && r.lotNumber) merged.lotNumber = r.lotNumber;
      if (!merged.make && r.make) merged.make = r.make;
      if (!merged.model && r.model) merged.model = r.model;
      if (!merged.year && r.year) merged.year = r.year;
      if (!merged.mileage && r.mileage) merged.mileage = r.mileage;
      if (!merged.damageType && r.damageType) merged.damageType = r.damageType;
      if (!merged.location && r.location) merged.location = r.location;

      // Merge images (deduplicate)
      const existingImages = new Set(merged.images);
      for (const img of r.images) {
        if (!existingImages.has(img)) {
          merged.images.push(img);
        }
      }

      // Track sources
      if (!merged.sources.includes(r.source)) {
        merged.sources.push(r.source);
      }
      if (!merged.sourceUrls.includes(r.sourceUrl)) {
        merged.sourceUrls.push(r.sourceUrl);
      }
    }

    // Calculate data quality score
    merged.dataQuality = this.calculateQuality(merged);

    return merged;
  }

  /**
   * Calculate data quality score (0-1)
   */
  private calculateQuality(data: MergedVinData): number {
    let score = 0;

    if (data.vin && data.vin.length === 17) score += 0.2;
    if (data.title && data.title.length > 5) score += 0.1;
    if (data.price && data.price > 0) score += 0.15;
    if (data.images.length > 0) score += 0.15;
    if (data.saleDate) score += 0.1;
    if (data.make) score += 0.05;
    if (data.model) score += 0.05;
    if (data.year) score += 0.05;
    if (data.mileage) score += 0.05;
    if (data.damageType) score += 0.05;
    if (data.location) score += 0.05;

    return Math.round(score * 100) / 100;
  }
}
