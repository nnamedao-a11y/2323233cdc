/**
 * Competitor Search Provider
 * 
 * Пошук через публічні VIN-пошукові сервіси конкурентів
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  VinSearchCandidate,
  VinSearchContext,
  VinSearchProvider,
} from '../interfaces/vin-search-provider.interface';

interface CompetitorConfig {
  name: string;
  searchUrl: (vin: string) => string;
  enabled: boolean;
}

@Injectable()
export class CompetitorSearchProvider implements VinSearchProvider {
  readonly name = 'competitor_default';
  readonly priority = 4;
  private readonly logger = new Logger(CompetitorSearchProvider.name);

  // List of competitor/public VIN lookup services
  private readonly competitors: CompetitorConfig[] = [
    {
      name: 'autobidmaster',
      searchUrl: (vin) => `https://autobidmaster.com/search/${vin}`,
      enabled: true,
    },
    {
      name: 'salvagebid',
      searchUrl: (vin) => `https://salvagebid.com/search?q=${vin}`,
      enabled: true,
    },
    {
      name: 'carfax_free',
      searchUrl: (vin) => `https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=${vin}`,
      enabled: true,
    },
  ];

  async search(context: VinSearchContext): Promise<VinSearchCandidate[]> {
    const vin = context.vin.trim().toUpperCase();
    const candidates: VinSearchCandidate[] = [];

    // Generate candidate URLs for competitor sources
    for (const competitor of this.competitors) {
      if (!competitor.enabled) continue;

      candidates.push({
        vin,
        title: `VIN ${vin} - ${competitor.name}`,
        sourceName: competitor.name,
        sourceUrl: competitor.searchUrl(vin),
        isAuction: competitor.name !== 'carfax_free',
        confidence: 0.55,
        raw: { competitor: competitor.name },
      });
    }

    this.logger.debug(`[Competitor] Generated ${candidates.length} candidate URLs for ${vin}`);
    return candidates;
  }
}
