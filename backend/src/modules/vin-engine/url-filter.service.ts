/**
 * URL Filter Service
 * 
 * Filters and prioritizes URLs from search results
 */

import { Injectable, Logger } from '@nestjs/common';
import { SearchResult } from './search.provider';

export interface FilteredUrl {
  url: string;
  source: string;
  priority: number;
  domain: string;
}

// Domain priority scores
const DOMAIN_PRIORITY: Record<string, number> = {
  'copart.com': 100,
  'iaai.com': 100,
  'autobidmaster.com': 90,
  'salvagebid.com': 85,
  'bidfax.info': 80,
  'en.bidfax.info': 80,
  'poctra.com': 75,
  'stat.vin': 70,
  'carfax.com': 65,
  'vehiclehistory.com': 60,
  'clearvin.com': 55,
  'epicvin.com': 50,
};

@Injectable()
export class UrlFilterService {
  private readonly logger = new Logger(UrlFilterService.name);

  /**
   * Filter and prioritize URLs
   */
  filter(results: SearchResult[]): FilteredUrl[] {
    const filtered: FilteredUrl[] = [];

    for (const result of results) {
      try {
        const url = new URL(result.url);
        const domain = url.hostname.toLowerCase().replace('www.', '');
        
        // Skip excluded patterns
        if (this.shouldExclude(result.url, result.snippet)) {
          continue;
        }

        // Calculate priority
        let priority = DOMAIN_PRIORITY[domain] || 30;
        
        // Boost for lot/vehicle pages
        if (result.url.includes('/lot/') || result.url.includes('/vehicle/')) {
          priority += 10;
        }

        // Boost for VIN in URL
        if (result.url.match(/[A-HJ-NPR-Z0-9]{17}/i)) {
          priority += 5;
        }

        filtered.push({
          url: result.url,
          source: this.identifySource(domain),
          priority,
          domain,
        });

      } catch (error) {
        // Invalid URL, skip
      }
    }

    // Sort by priority descending
    filtered.sort((a, b) => b.priority - a.priority);

    // Limit to top 20
    return filtered.slice(0, 20);
  }

  /**
   * Check if URL should be excluded
   */
  private shouldExclude(url: string, snippet: string): boolean {
    const urlLower = url.toLowerCase();
    const snippetLower = (snippet || '').toLowerCase();

    // Exclude patterns
    const excludePatterns = [
      '/search',
      '/results',
      '/forum',
      '/discussion',
      '/blog',
      '/news',
      '/article',
      '/help',
      '/faq',
      '/contact',
      '/about',
      '/login',
      '/register',
      '/cart',
      '/checkout',
    ];

    for (const pattern of excludePatterns) {
      if (urlLower.includes(pattern)) {
        return true;
      }
    }

    // Exclude if snippet mentions "no results" or similar
    const noResultsPatterns = [
      'no results',
      'no vehicles found',
      'no matches',
      'not found',
      '0 results',
    ];

    for (const pattern of noResultsPatterns) {
      if (snippetLower.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Identify source from domain
   */
  private identifySource(domain: string): string {
    if (domain.includes('copart')) return 'copart';
    if (domain.includes('iaai')) return 'iaai';
    if (domain.includes('autobidmaster')) return 'autobidmaster';
    if (domain.includes('salvagebid')) return 'salvagebid';
    if (domain.includes('bidfax')) return 'bidfax';
    if (domain.includes('poctra')) return 'poctra';
    if (domain.includes('stat.vin')) return 'statvin';
    if (domain.includes('carfax')) return 'carfax';
    if (domain.includes('vehiclehistory')) return 'vehiclehistory';
    return 'web';
  }
}
