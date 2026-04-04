/**
 * VIN Merge Service
 * 
 * Об'єднує результати з різних джерел, бере найкраще по confidence
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExtractedVehicle } from '../interfaces/extracted-vehicle.interface';
import { MergedVehicle } from '../interfaces/merged-vehicle.interface';

@Injectable()
export class VinMergeService {
  private readonly logger = new Logger(VinMergeService.name);

  merge(vin: string, items: ExtractedVehicle[]): MergedVehicle | null {
    if (!items.length) {
      return null;
    }

    // Sort by confidence (highest first)
    const sorted = [...items].sort((a, b) => b.confidence - a.confidence);

    // Helper to pick best value
    const pickBest = <T>(selector: (x: ExtractedVehicle) => T | undefined): T | undefined => {
      for (const item of sorted) {
        const val = selector(item);
        if (val !== undefined && val !== null && val !== '') {
          return val;
        }
      }
      return undefined;
    };

    // Merge images from all sources
    const allImages = new Set<string>();
    for (const item of items) {
      if (item.images) {
        for (const img of item.images) {
          if (img && !img.includes('placeholder')) {
            allImages.add(img);
          }
        }
      }
    }

    // Calculate average confidence
    const avgConfidence = items.reduce((sum, x) => sum + (x.confidence || 0), 0) / items.length;

    // Collect sources
    const sourcesUsed = [...new Set(items.map(x => x.source))];

    // Build merged result
    const merged: MergedVehicle = {
      vin,
      title: pickBest(x => x.title),
      year: pickBest(x => x.year),
      make: pickBest(x => x.make),
      model: pickBest(x => x.model),
      lotNumber: pickBest(x => x.lotNumber),
      location: pickBest(x => x.location),
      saleDate: pickBest(x => x.saleDate),
      price: pickBest(x => x.price),
      images: [...allImages].slice(0, 20),
      damageType: pickBest(x => x.damageType),
      mileage: pickBest(x => x.mileage),
      confidence: Math.round(avgConfidence * 100) / 100,
      sourcesUsed,
      sourceCount: sourcesUsed.length,
    };

    // If no title but have year/make/model, build title
    if (!merged.title && (merged.year || merged.make || merged.model)) {
      merged.title = `${merged.year || ''} ${merged.make || ''} ${merged.model || ''}`.trim() || undefined;
    }

    this.logger.log(
      `[Merge] VIN ${vin}: ${items.length} items → confidence ${merged.confidence}, ` +
      `sources: ${sourcesUsed.join(', ')}`
    );

    return merged;
  }
}
