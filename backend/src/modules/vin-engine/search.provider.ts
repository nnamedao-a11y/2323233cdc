/**
 * VIN Search Provider
 * 
 * Google/Bing search for VIN information
 * No API keys needed - uses web search
 */

import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

const BROWSER_PATH = '/pw-browsers/chromium_headless_shell-1208/chrome-linux/headless_shell';

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  source: string;
}

// Trusted domains for VIN search
const TRUSTED_DOMAINS = [
  'copart.com',
  'iaai.com',
  'autobidmaster.com',
  'salvagebid.com',
  'bidfax.info',
  'poctra.com',
  'stat.vin',
  'en.bidfax.info',
  'vehiclehistory.com',
  'carfax.com',
  'autocheck.com',
  'vindecoderz.com',
  'vincheck.info',
  'clearvin.com',
  'carvertical.com',
  'epicvin.com',
  'bumper.com',
];

// Domains to exclude
const EXCLUDE_DOMAINS = [
  'youtube.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'pinterest.com',
  'reddit.com',
  'wikipedia.org',
  'amazon.com',
  'ebay.com',
];

@Injectable()
export class SearchProviderService {
  private readonly logger = new Logger(SearchProviderService.name);

  /**
   * Search for VIN across search engines
   */
  async searchVin(vin: string): Promise<SearchResult[]> {
    if (!vin || vin.length < 11) {
      this.logger.warn(`Invalid VIN: ${vin}`);
      return [];
    }

    const queries = [
      `${vin}`,
      `${vin} copart`,
      `${vin} iaai auction`,
      `${vin} lot salvage`,
    ];

    const allResults: SearchResult[] = [];

    for (const query of queries) {
      try {
        const results = await this.googleSearch(query);
        allResults.push(...results);
      } catch (error: any) {
        this.logger.warn(`Search failed for "${query}": ${error.message}`);
      }
    }

    // Deduplicate by URL
    const uniqueResults = this.deduplicateResults(allResults);
    
    // Filter relevant results
    const filtered = this.filterResults(uniqueResults);

    this.logger.log(`[VIN Search] Found ${filtered.length} relevant results for ${vin}`);
    
    return filtered;
  }

  /**
   * Google search using Puppeteer
   */
  private async googleSearch(query: string): Promise<SearchResult[]> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: BROWSER_PATH,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      const page = await browser.newPage();
      
      // Set realistic user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Use DuckDuckGo HTML version (no captcha)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const results = await page.evaluate(() => {
        const items: Array<{ url: string; title: string; snippet: string }> = [];
        
        document.querySelectorAll('.result').forEach((el) => {
          const linkEl = el.querySelector('.result__a') as HTMLAnchorElement;
          const snippetEl = el.querySelector('.result__snippet');
          
          if (linkEl && linkEl.href) {
            // DuckDuckGo uses redirect URLs, extract real URL
            let url = linkEl.href;
            const match = url.match(/uddg=([^&]+)/);
            if (match) {
              url = decodeURIComponent(match[1]);
            }
            
            items.push({
              url: url,
              title: linkEl.textContent?.trim() || '',
              snippet: snippetEl?.textContent?.trim() || '',
            });
          }
        });
        
        return items;
      });

      await browser.close();
      
      return results.map(r => ({
        ...r,
        source: 'duckduckgo',
      }));

    } catch (error: any) {
      if (browser) await browser.close();
      this.logger.error(`Google search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Deduplicate results by URL
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      const key = new URL(r.url).pathname;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Filter relevant results
   */
  private filterResults(results: SearchResult[]): SearchResult[] {
    return results.filter(r => {
      try {
        const hostname = new URL(r.url).hostname.toLowerCase();
        
        // Exclude unwanted domains
        if (EXCLUDE_DOMAINS.some(d => hostname.includes(d))) {
          return false;
        }
        
        // Exclude PDFs and docs
        if (r.url.match(/\.(pdf|doc|docx|xls|xlsx)$/i)) {
          return false;
        }
        
        return true;
      } catch {
        return false;
      }
    }).sort((a, b) => {
      // Prioritize trusted domains
      const aHostname = new URL(a.url).hostname.toLowerCase();
      const bHostname = new URL(b.url).hostname.toLowerCase();
      
      const aTrust = TRUSTED_DOMAINS.some(d => aHostname.includes(d)) ? 1 : 0;
      const bTrust = TRUSTED_DOMAINS.some(d => bHostname.includes(d)) ? 1 : 0;
      
      return bTrust - aTrust;
    });
  }

  /**
   * Check if domain is trusted
   */
  isTrustedDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return TRUSTED_DOMAINS.some(d => hostname.includes(d));
    } catch {
      return false;
    }
  }
}
