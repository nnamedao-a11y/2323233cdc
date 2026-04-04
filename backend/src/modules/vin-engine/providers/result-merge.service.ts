/**
 * Result Merge Service
 * 
 * Об'єднання результатів з різних провайдерів
 */

import { Injectable } from '@nestjs/common';
import { VinSearchCandidate } from '../interfaces/vin-search-provider.interface';

@Injectable()
export class ResultMergeService {
  /**
   * Merge multiple candidates into best result
   */
  mergeCandidates(candidates: VinSearchCandidate[]): VinSearchCandidate | null {
    if (!candidates.length) return null;

    // Sort by confidence (highest first)
    const sorted = [...candidates].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
    );

    // Take best candidate as base
    const base: VinSearchCandidate = { ...sorted[0] };
    const allSources: string[] = [base.sourceName];

    // Fill missing fields from other candidates
    for (const candidate of sorted.slice(1)) {
      if (!base.title && candidate.title) base.title = candidate.title;
      if (!base.price && candidate.price) base.price = candidate.price;
      if ((!base.images || base.images.length === 0) && candidate.images?.length) {
        base.images = candidate.images;
      }
      if (!base.saleDate && candidate.saleDate) base.saleDate = candidate.saleDate;
      if (!base.lotNumber && candidate.lotNumber) base.lotNumber = candidate.lotNumber;
      if (!base.location && candidate.location) base.location = candidate.location;
      if (!base.mileage && candidate.mileage) base.mileage = candidate.mileage;
      if (!base.make && candidate.make) base.make = candidate.make;
      if (!base.model && candidate.model) base.model = candidate.model;
      if (!base.year && candidate.year) base.year = candidate.year;
      if (!base.damageType && candidate.damageType) base.damageType = candidate.damageType;
      if (!base.sourceUrl && candidate.sourceUrl) base.sourceUrl = candidate.sourceUrl;
      
      // Merge auction flag (if any says true, it's auction)
      if (base.isAuction !== true && candidate.isAuction === true) {
        base.isAuction = true;
      }

      // Collect all sources
      if (candidate.sourceName && !allSources.includes(candidate.sourceName)) {
        allSources.push(candidate.sourceName);
      }
    }

    // Store all sources in raw
    base.raw = {
      ...base.raw,
      allSources,
      mergedFrom: candidates.length,
    };

    return base;
  }

  /**
   * Filter candidates to only exact VIN matches
   */
  filterExactMatches(candidates: VinSearchCandidate[], vin: string): VinSearchCandidate[] {
    const normalizedVin = vin.trim().toUpperCase();
    return candidates.filter(c => {
      const candidateVin = (c.vin || '').trim().toUpperCase();
      return candidateVin === normalizedVin;
    });
  }
}
