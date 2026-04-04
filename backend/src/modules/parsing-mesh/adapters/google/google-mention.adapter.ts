/**
 * Google Mention Adapter
 * 
 * Адаптер для пошуку згадок VIN через Google/DuckDuckGo
 * Це fallback layer - найстабільніший, бо працює через публічний пошук
 */

import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import {
  VinSourceAdapter,
  SourceConfig,
  SearchResult,
  NormalizedVehicle,
  HealthResult,
  SourceValidationResult,
} from '../interfaces/vin-source-adapter.interface';
import { isValidVin, cleanVin } from '../../utils/vin.utils';
import { extractDomain, isExcludedDomain, normalizeUrl } from '../../utils/url.utils';
import { HtmlDetailAdapter } from '../html/html-detail.adapter';

interface SearchResultUrl {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  priority: number;
}

@Injectable()
export class GoogleMentionAdapter implements VinSourceAdapter {
  readonly kind = 'google';
  readonly displayName = 'Google Mentions Search';
  private readonly logger = new Logger(GoogleMentionAdapter.name);

  constructor(private readonly htmlAdapter: HtmlDetailAdapter) {}

  canHandle(source: SourceConfig): boolean {
    return source.parserKind === 'google';
  }

  async search(vin: string, source: SourceConfig): Promise<SearchResult[]> {
    const cleanedVin = cleanVin(vin);
    if (!isValidVin(cleanedVin)) return [];

    try {
      // Use DuckDuckGo HTML for reliability (no JS required)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanedVin + ' auction copart iaai')}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`[GoogleMention] Search failed: HTTP ${response.status}`);
        return [];
      }

      const html = await response.text();
      const urls = this.parseSearchResults(html, cleanedVin);

      this.logger.log(`[GoogleMention] Found ${urls.length} URLs for VIN ${cleanedVin}`);

      // Convert to SearchResults
      return urls.map(u => ({
        url: u.url,
        title: u.title,
        snippet: u.snippet,
        source: `google_${u.domain}`,
      }));
    } catch (error: any) {
      this.logger.warn(`[GoogleMention] Search error: ${error.message}`);
      return [];
    }
  }

  async extract(input: SearchResult, source: SourceConfig): Promise<NormalizedVehicle | null> {
    // Delegate extraction to HTML adapter with dynamic source config
    const domain = extractDomain(input.url);
    if (!domain) return null;

    const dynamicSource: SourceConfig = {
      ...source,
      name: `google_${domain}`,
      domain,
      parserKind: 'html',
      selectorConfig: this.getSelectorsForDomain(domain),
    };

    // Fetch the page
    try {
      const response = await fetch(input.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return null;

      input.html = await response.text();
      return this.htmlAdapter.extract(input, dynamicSource);
    } catch (error: any) {
      this.logger.warn(`[GoogleMention] Extract error for ${input.url}: ${error.message}`);
      return null;
    }
  }

  async healthCheck(source: SourceConfig): Promise<HealthResult> {
    const startTime = Date.now();
    
    try {
      const testVin = '5YJSA1DN2CFP09123';
      const results = await this.search(testVin, source);
      
      return {
        healthy: results.length > 0,
        latency: Date.now() - startTime,
        message: `Found ${results.length} results`,
        checkedAt: new Date(),
      };
    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: error.message,
        checkedAt: new Date(),
      };
    }
  }

  async validate(source: SourceConfig): Promise<SourceValidationResult> {
    const vins = source.sampleVins || ['5YJSA1DN2CFP09123'];
    let successfulVins = 0;
    let totalLatency = 0;
    const errors: string[] = [];

    for (const vin of vins) {
      try {
        const startTime = Date.now();
        const results = await this.search(vin, source);
        totalLatency += Date.now() - startTime;
        
        if (results.length > 0) successfulVins++;
      } catch (error: any) {
        errors.push(`VIN ${vin}: ${error.message}`);
      }
    }

    return {
      valid: successfulVins > 0,
      hitRate: successfulVins / vins.length,
      avgCompleteness: 0.5, // Google results have variable completeness
      avgLatency: totalLatency / vins.length,
      testedVins: vins.length,
      successfulVins,
      errors,
    };
  }

  // ========== PRIVATE ==========

  private parseSearchResults(html: string, targetVin: string): SearchResultUrl[] {
    const $ = cheerio.load(html);
    const results: SearchResultUrl[] = [];
    const seen = new Set<string>();

    // DuckDuckGo HTML results
    $('.result, .results_links').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a.result__a, a.result__url').first();
      const url = link.attr('href');
      const title = link.text().trim();
      const snippet = $el.find('.result__snippet').text().trim();

      if (!url) return;

      // Clean DuckDuckGo redirect URL
      let cleanUrl = url;
      if (url.includes('duckduckgo.com/l/?uddg=')) {
        try {
          const urlObj = new URL(url);
          cleanUrl = decodeURIComponent(urlObj.searchParams.get('uddg') || url);
        } catch {
          // Keep original
        }
      }

      const domain = extractDomain(cleanUrl);
      if (!domain || isExcludedDomain(domain)) return;
      if (seen.has(domain)) return;
      seen.add(domain);

      // Prioritize known good sources
      const priority = this.getDomainPriority(domain);

      results.push({
        url: cleanUrl,
        title,
        snippet,
        domain,
        priority,
      });
    });

    // Sort by priority
    results.sort((a, b) => a.priority - b.priority);

    // Limit to top 10
    return results.slice(0, 10);
  }

  private getDomainPriority(domain: string): number {
    const lowerDomain = domain.toLowerCase();
    
    // Auction sites - highest priority
    if (lowerDomain.includes('copart')) return 1;
    if (lowerDomain.includes('iaai')) return 1;
    
    // Known aggregators
    if (lowerDomain.includes('bidfax')) return 5;
    if (lowerDomain.includes('stat.vin') || lowerDomain.includes('statvin')) return 5;
    if (lowerDomain.includes('poctra')) return 6;
    if (lowerDomain.includes('autobidmaster')) return 7;
    if (lowerDomain.includes('salvagebid')) return 7;
    
    // Classifieds
    if (lowerDomain.includes('autotrader')) return 10;
    if (lowerDomain.includes('cars.com')) return 10;
    if (lowerDomain.includes('cargurus')) return 10;
    
    // Other
    return 50;
  }

  private getSelectorsForDomain(domain: string): any {
    const lowerDomain = domain.toLowerCase();
    
    // Known domain selectors
    const domainSelectors: Record<string, any> = {
      'stat.vin': {
        vin: '.vin-code',
        title: '.car-title',
        price: '.sale-price',
        images: '.car-photos img',
        damage: '.damage-type',
      },
      'bidfax.info': {
        vin: '.vin-number',
        title: '.vehicle-title, h1',
        price: '.price, .final-bid',
        images: '.gallery img',
      },
      'poctra.com': {
        vin: '.vin',
        title: '.title, h1',
        price: '.price',
        images: '.carousel img',
      },
    };

    for (const [key, selectors] of Object.entries(domainSelectors)) {
      if (lowerDomain.includes(key.replace('.', ''))) {
        return selectors;
      }
    }

    // Default selectors
    return {
      vin: '.vin, [data-vin]',
      title: 'h1, .title',
      price: '.price',
      images: '.gallery img, .photos img',
    };
  }
}
