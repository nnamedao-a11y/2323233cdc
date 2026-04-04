/**
 * VIN Discovery Service
 * 
 * Priority-based source discovery with rate limiting
 * 
 * Strategy:
 * 1. Direct VIN patterns (exact URL match)
 * 2. Search patterns (query-based)
 * 3. Cached historical hits
 * 4. Fallback aggregators
 */

import { Injectable, Logger } from '@nestjs/common';
import { DiscoveredSource, SourceType, SourceTier } from '../dto/vin.dto';

// Rate limit tracking per domain
const rateLimits = new Map<string, { lastRequest: number; minDelayMs: number }>();

// Source configurations with verified URLs (January 2026)
// NO API INTEGRATIONS - ONLY SCRAPING
const SOURCES: DiscoveredSource[] = [
  // ========== TIER 1: Primary Auctions (SCRAPING ONLY) ==========
  {
    name: 'IAAI',
    domain: 'iaai.com',
    url: 'https://www.iaai.com/Search?Keyword={VIN}',
    type: 'stealth',
    tier: 1,
    priority: 100,
    trustScore: 0.95,
    rateLimit: { requestsPerMinute: 3 },
  },
  {
    name: 'Copart',
    domain: 'copart.com',
    url: 'https://www.copart.com/lotSearchResults?free=true&query={VIN}',
    type: 'stealth',
    tier: 1,
    priority: 98,
    trustScore: 0.95,
    rateLimit: { requestsPerMinute: 3 },
  },
  {
    name: 'CopartDirect',
    domain: 'copart.com',
    url: 'https://www.copart.com/vehicleFinder/{VIN}',
    type: 'stealth',
    tier: 1,
    priority: 97,
    trustScore: 0.95,
    rateLimit: { requestsPerMinute: 3 },
  },

  // ========== TIER 2: Aggregators & Mirrors ==========
  {
    name: 'AutoBidMaster',
    domain: 'autobidmaster.com',
    url: 'https://www.autobidmaster.com/en/search/?q={VIN}',
    type: 'stealth',
    tier: 2,
    priority: 90,
    trustScore: 0.88,
    rateLimit: { requestsPerMinute: 5 },
  },
  {
    name: 'SalvageReseller',
    domain: 'salvagereseller.com',
    url: 'https://www.salvagereseller.com/search?query={VIN}',
    type: 'stealth',
    tier: 2,
    priority: 88,
    trustScore: 0.85,
    rateLimit: { requestsPerMinute: 5 },
  },
  {
    name: 'BidFax',
    domain: 'bidfax.info',
    url: 'https://bidfax.info/{VIN}',
    type: 'stealth',
    tier: 2,
    priority: 85,
    trustScore: 0.82,
    rateLimit: { requestsPerMinute: 2 },
  },
  {
    name: 'Poctra',
    domain: 'poctra.com',
    url: 'https://poctra.com/vin/{VIN}',
    type: 'stealth',
    tier: 2,
    priority: 82,
    trustScore: 0.80,
    rateLimit: { requestsPerMinute: 2 },
  },
  {
    name: 'StatVin',
    domain: 'stat.vin',
    url: 'https://stat.vin/cars/{VIN}',
    type: 'stealth',
    tier: 1,  // Підвищую пріоритет - працює найкраще!
    priority: 95,
    trustScore: 0.90,
    rateLimit: { requestsPerMinute: 10 },
  },

  // ========== TIER 3: Fallback & Decoders ==========
  {
    name: 'VINDecoderz',
    domain: 'vindecoderz.com',
    url: 'https://www.vindecoderz.com/EN/check-lookup/{VIN}',
    type: 'html_light',
    tier: 3,
    priority: 60,
    trustScore: 0.65,
    rateLimit: { requestsPerMinute: 10 },
  },
  {
    name: 'VINPit',
    domain: 'vinpit.com',
    url: 'https://vinpit.com/vin/{VIN}',
    type: 'html_light',
    tier: 3,
    priority: 58,
    trustScore: 0.60,
    rateLimit: { requestsPerMinute: 10 },
  },
  {
    name: 'VehicleHistory',
    domain: 'vehiclehistory.com',
    url: 'https://www.vehiclehistory.com/vin-report/{VIN}',
    type: 'html_light',
    tier: 3,
    priority: 55,
    trustScore: 0.58,
    rateLimit: { requestsPerMinute: 5 },
  },
];

@Injectable()
export class VinDiscoveryService {
  private readonly logger = new Logger(VinDiscoveryService.name);

  /**
   * Discover sources with rate limit awareness
   */
  async discoverParallel(vin: string, maxTier: SourceTier = 3): Promise<DiscoveredSource[]> {
    const cleanVin = vin.trim().toUpperCase();

    // Filter by tier and check rate limits
    const now = Date.now();
    const availableSources: DiscoveredSource[] = [];

    for (const source of SOURCES) {
      if (source.tier > maxTier) continue;

      // Check rate limit
      const rateInfo = rateLimits.get(source.domain);
      const minDelayMs = source.rateLimit ? (60000 / source.rateLimit.requestsPerMinute) : 0;

      if (rateInfo && (now - rateInfo.lastRequest) < minDelayMs) {
        this.logger.debug(`[Discovery] Rate limited: ${source.name} (wait ${minDelayMs - (now - rateInfo.lastRequest)}ms)`);
        continue;
      }

      availableSources.push({
        ...source,
        url: source.url.replace('{VIN}', cleanVin),
      });
    }

    this.logger.debug(
      `[Discovery] ${availableSources.length}/${SOURCES.filter(s => s.tier <= maxTier).length} sources available for ${cleanVin}`
    );

    // Sort by priority (highest first)
    return availableSources.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Mark source as used (for rate limiting)
   */
  markUsed(domain: string): void {
    const source = SOURCES.find(s => s.domain === domain);
    const minDelayMs = source?.rateLimit ? (60000 / source.rateLimit.requestsPerMinute) : 1000;
    
    rateLimits.set(domain, {
      lastRequest: Date.now(),
      minDelayMs,
    });
  }

  /**
   * Get wait time for domain (for retry logic)
   */
  getWaitTime(domain: string): number {
    const rateInfo = rateLimits.get(domain);
    if (!rateInfo) return 0;

    const elapsed = Date.now() - rateInfo.lastRequest;
    return Math.max(0, rateInfo.minDelayMs - elapsed);
  }

  /**
   * Group sources by type (SCRAPING ONLY)
   */
  groupByType(sources: DiscoveredSource[]): {
    fast: DiscoveredSource[];    // json only (no API)
    light: DiscoveredSource[];   // html_light (axios + cheerio)
    stealth: DiscoveredSource[]; // stealth (playwright/puppeteer with Cloudflare bypass)
  } {
    return {
      fast: sources.filter(s => s.type === 'json'),
      light: sources.filter(s => s.type === 'html_light'),
      stealth: sources.filter(s => s.type === 'stealth' || s.type === 'html_heavy'),
    };
  }

  /**
   * Get all source configs
   */
  getAllSources(): DiscoveredSource[] {
    return [...SOURCES];
  }

  /**
   * Get source by name
   */
  getSource(name: string): DiscoveredSource | undefined {
    return SOURCES.find(s => s.name.toLowerCase() === name.toLowerCase());
  }
}
