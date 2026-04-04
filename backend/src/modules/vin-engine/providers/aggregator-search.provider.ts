/**
 * Aggregator Search Provider
 * 
 * Пошук через VIN агрегатори (bidfax, poctra, stat.vin тощо)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  VinSearchCandidate,
  VinSearchContext,
  VinSearchProvider,
} from '../interfaces/vin-search-provider.interface';

interface AggregatorConfig {
  name: string;
  searchUrl: (vin: string) => string;
  enabled: boolean;
}

@Injectable()
export class AggregatorSearchProvider implements VinSearchProvider {
  readonly name = 'aggregator_default';
  readonly priority = 3;
  private readonly logger = new Logger(AggregatorSearchProvider.name);

  // List of aggregator sources to try
  private readonly aggregators: AggregatorConfig[] = [
    {
      name: 'bidfax',
      searchUrl: (vin) => `https://bidfax.info/${vin}`,
      enabled: true,
    },
    {
      name: 'poctra',
      searchUrl: (vin) => `https://poctra.com/v/${vin}`,
      enabled: true,
    },
    {
      name: 'stat_vin',
      searchUrl: (vin) => `https://stat.vin/vin/${vin}`,
      enabled: true,
    },
  ];

  async search(context: VinSearchContext): Promise<VinSearchCandidate[]> {
    const vin = context.vin.trim().toUpperCase();
    const candidates: VinSearchCandidate[] = [];

    // Return aggregator URLs as potential sources
    // Real extraction would happen in a separate step
    for (const aggregator of this.aggregators) {
      if (!aggregator.enabled) continue;

      candidates.push({
        vin,
        title: `VIN ${vin} - ${aggregator.name}`,
        sourceName: aggregator.name,
        sourceUrl: aggregator.searchUrl(vin),
        isAuction: true,
        confidence: 0.6,
        raw: { aggregator: aggregator.name },
      });
    }

    this.logger.debug(`[Aggregator] Generated ${candidates.length} candidate URLs for ${vin}`);
    return candidates;
  }
}
