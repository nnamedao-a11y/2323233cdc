/**
 * VIN Discovery Service
 * 
 * Збирає URL з усіх можливих джерел для VIN
 * Tier 1 → Tier 2 → Tier 3 → Tier 4
 */

import { Injectable, Logger } from '@nestjs/common';
import { DiscoveredUrl } from '../interfaces/discovered-url.interface';

// Конфігурація джерел по тірах
const TIER1_SOURCES = [
  {
    name: 'NHTSA',
    domain: 'vpic.nhtsa.dot.gov',
    urlPattern: (vin: string) => `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`,
    parserKind: 'nhtsa' as const,
    priority: 100,
  },
  {
    name: 'IAAI',
    domain: 'iaai.com',
    urlPattern: (vin: string) => `https://www.iaai.com/Search?Keyword=${vin}`,
    parserKind: 'search_form' as const,
    priority: 95,
  },
  {
    name: 'FaxVIN',
    domain: 'faxvin.com',
    urlPattern: (vin: string) => `https://www.faxvin.com/vin-check/result?vin=${vin}`,
    parserKind: 'html_detail' as const,
    priority: 90,
  },
  {
    name: 'SalvageBid',
    domain: 'salvagebid.com',
    urlPattern: (vin: string) => `https://salvagebid.com/search?vin=${vin}`,
    parserKind: 'search_form' as const,
    priority: 88,
  },
];

const TIER2_SOURCES = [
  {
    name: 'BidFax',
    domain: 'bidfax.info',
    urlPattern: (vin: string) => `https://bidfax.info/${vin}`,
    parserKind: 'html_detail' as const,
    priority: 80,
  },
  {
    name: 'Poctra',
    domain: 'poctra.com',
    urlPattern: (vin: string) => `https://poctra.com/search?q=${vin}`,
    parserKind: 'search_form' as const,
    priority: 78,
  },
  {
    name: 'AutoBidMaster',
    domain: 'autobidmaster.com',
    urlPattern: (vin: string) => `https://autobidmaster.com/en/search?q=${vin}`,
    parserKind: 'search_form' as const,
    priority: 75,
  },
  {
    name: 'StatVin',
    domain: 'stat.vin',
    urlPattern: (vin: string) => `https://stat.vin/cars/${vin}`,
    parserKind: 'html_detail' as const,
    priority: 72,
  },
];

const TIER3_SOURCES = [
  {
    name: 'ClearVin',
    domain: 'clearvin.com',
    urlPattern: (vin: string) => `https://www.clearvin.com/vin/${vin}`,
    parserKind: 'html_detail' as const,
    priority: 60,
  },
  {
    name: 'VinDecoderz',
    domain: 'vindecoderz.com',
    urlPattern: (vin: string) => `https://www.vindecoderz.com/EN/check-lookup/${vin}`,
    parserKind: 'html_detail' as const,
    priority: 55,
  },
];

@Injectable()
export class VinDiscoveryService {
  private readonly logger = new Logger(VinDiscoveryService.name);

  async discover(vin: string): Promise<DiscoveredUrl[]> {
    const normalizedVin = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    
    if (normalizedVin.length !== 17) {
      this.logger.warn(`[Discovery] Invalid VIN format: ${vin}`);
      return [];
    }

    const urls: DiscoveredUrl[] = [];

    // Tier 1 - trusted stable
    for (const source of TIER1_SOURCES) {
      urls.push({
        url: source.urlPattern(normalizedVin),
        domain: source.domain,
        sourceName: source.name,
        parserKind: source.parserKind,
        priority: source.priority,
        tier: 1,
      });
    }

    // Tier 2 - competitor/aggregator
    for (const source of TIER2_SOURCES) {
      urls.push({
        url: source.urlPattern(normalizedVin),
        domain: source.domain,
        sourceName: source.name,
        parserKind: source.parserKind,
        priority: source.priority,
        tier: 2,
      });
    }

    // Tier 3 - public search fallback
    for (const source of TIER3_SOURCES) {
      urls.push({
        url: source.urlPattern(normalizedVin),
        domain: source.domain,
        sourceName: source.name,
        parserKind: source.parserKind,
        priority: source.priority,
        tier: 3,
      });
    }

    this.logger.log(`[Discovery] Found ${urls.length} sources for VIN ${normalizedVin}`);

    // Sort by priority
    return urls.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get only tier 1 sources (for quick lookup)
   */
  async discoverTier1(vin: string): Promise<DiscoveredUrl[]> {
    const all = await this.discover(vin);
    return all.filter(u => u.tier === 1);
  }

  /**
   * Get sources up to specified tier
   */
  async discoverUpToTier(vin: string, maxTier: 1 | 2 | 3 | 4): Promise<DiscoveredUrl[]> {
    const all = await this.discover(vin);
    return all.filter(u => u.tier <= maxTier);
  }
}
