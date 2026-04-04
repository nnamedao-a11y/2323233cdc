/**
 * VIN Candidate Scoring Service
 * 
 * Розрахунок confidence score для кандидатів
 */

import { Injectable } from '@nestjs/common';
import { VinSearchCandidate } from '../interfaces/vin-search-provider.interface';
import { SourceWeightService } from './source-weight.service';

@Injectable()
export class VinCandidateScoringService {
  constructor(private readonly sourceWeightService: SourceWeightService) {}

  /**
   * Calculate confidence score for a VIN search candidate
   */
  score(candidate: VinSearchCandidate, inputVin: string): number {
    let score = 0;

    const normalizedInputVin = this.normalizeVin(inputVin);
    const normalizedCandidateVin = this.normalizeVin(candidate.vin);

    // VIN exact match = +0.4
    if (normalizedCandidateVin && normalizedCandidateVin === normalizedInputVin) {
      score += 0.4;
    }

    // Sale date = +0.2
    if (candidate.saleDate) {
      score += 0.2;
    }

    // Price = +0.1
    if (candidate.price && candidate.price > 0) {
      score += 0.1;
    }

    // Images = +0.1
    if (candidate.images && candidate.images.length > 0) {
      score += 0.1;
    }

    // Is Auction = +0.1
    if (candidate.isAuction) {
      score += 0.1;
    }

    // Source trust weight = +0.1 max
    const sourceWeight = this.sourceWeightService.getWeight(candidate.sourceName);
    score += sourceWeight * 0.1;

    return Number(score.toFixed(3));
  }

  /**
   * Classify if result is from auction
   */
  classifyAuction(candidate: VinSearchCandidate): boolean {
    // Check explicit flag
    if (candidate.isAuction === true) return true;

    // Check source name
    const auctionSources = ['copart', 'iaai', 'manheim', 'autobidmaster', 'salvagebid'];
    if (auctionSources.some(src => candidate.sourceName?.toLowerCase().includes(src))) {
      return true;
    }

    // Check title/URL for auction indicators
    const auctionKeywords = ['auction', 'lot', 'bid', 'salvage', 'copart', 'iaai'];
    const textToCheck = `${candidate.title || ''} ${candidate.sourceUrl || ''}`.toLowerCase();
    
    if (auctionKeywords.some(kw => textToCheck.includes(kw))) {
      return true;
    }

    // Has lot number and sale date
    if (candidate.lotNumber && candidate.saleDate) {
      return true;
    }

    return false;
  }

  private normalizeVin(vin?: string): string {
    return (vin || '').trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  }
}
