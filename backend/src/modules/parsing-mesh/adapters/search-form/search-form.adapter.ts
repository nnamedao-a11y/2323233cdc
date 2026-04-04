/**
 * Search Form Adapter
 * 
 * Адаптер для сайтів з формою пошуку по VIN
 * Підходить для competitor sites з search functionality
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
import { isValidVin, cleanVin, findTargetVinInText, decodeYear, decodeWMI } from '../../utils/vin.utils';
import { normalizeUrl, isValidImageUrl } from '../../utils/url.utils';

type CheerioRoot = ReturnType<typeof cheerio.load>;

@Injectable()
export class SearchFormAdapter implements VinSourceAdapter {
  readonly kind = 'search_form';
  readonly displayName = 'Search Form Parser';
  private readonly logger = new Logger(SearchFormAdapter.name);

  canHandle(source: SourceConfig): boolean {
    return source.parserKind === 'search_form';
  }

  async search(vin: string, source: SourceConfig): Promise<SearchResult[]> {
    const cleanedVin = cleanVin(vin);
    if (!isValidVin(cleanedVin)) return [];

    const url = this.buildSearchUrl(source, cleanedVin);
    if (!url) return [];

    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: source.requestConfig?.method || 'GET',
        headers: this.getHeaders(source),
        signal: AbortSignal.timeout(source.requestConfig?.timeout || 15000),
      });

      if (!response.ok) {
        this.logger.warn(`[${source.name}] HTTP ${response.status}`);
        return [];
      }

      const html = await response.text();
      const latency = Date.now() - startTime;

      this.logger.debug(`[${source.name}] Search fetched ${html.length} bytes in ${latency}ms`);

      // Parse search results page
      const results = this.parseSearchResults(html, source, url, cleanedVin);
      
      return results;
    } catch (error: any) {
      this.logger.warn(`[${source.name}] Search error: ${error.message}`);
      return [];
    }
  }

  async extract(input: SearchResult, source: SourceConfig): Promise<NormalizedVehicle | null> {
    // If we already have parsed data from search results
    if (input.json) {
      return this.normalizeFromJson(input.json, source, input.url);
    }

    // Otherwise fetch detail page
    if (!input.html && input.url) {
      try {
        const response = await fetch(input.url, {
          headers: this.getHeaders(source),
          signal: AbortSignal.timeout(source.requestConfig?.timeout || 15000),
        });

        if (!response.ok) return null;
        input.html = await response.text();
      } catch {
        return null;
      }
    }

    if (!input.html) return null;

    try {
      const $ = cheerio.load(input.html);
      const selectors = source.selectorConfig || {};

      // Extract VIN - must match target
      const vin = this.extractVin($, selectors.vin);
      if (!vin) return null;

      // Extract fields
      const title = this.extractText($, selectors.title) || $('title').text().trim();
      const price = this.extractPrice($, selectors.price);
      const saleDate = this.extractDate($, selectors.saleDate);
      const lotNumber = this.extractText($, selectors.lotNumber);
      const mileage = this.extractNumber($, selectors.mileage);
      const damage = this.extractText($, selectors.damage);
      const location = this.extractText($, selectors.location);
      const images = this.extractImages($, selectors.images, source.domain);

      const vehicleInfo = this.parseVehicleInfo(title || '', vin);

      const confidence = this.calculateConfidence({
        vin: true,
        title: !!title,
        price: price !== null,
        images: images.length > 0,
        saleDate: !!saleDate,
        lotNumber: !!lotNumber,
      });

      return {
        vin,
        title,
        price,
        saleDate,
        lotNumber,
        mileage,
        damage,
        location,
        images,
        make: vehicleInfo.make,
        model: vehicleInfo.model,
        year: vehicleInfo.year,
        source: source.name,
        sourceUrl: input.url,
        isAuction: !!(lotNumber || saleDate),
        confidence,
        extractedAt: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`[${source.name}] Extract error: ${error.message}`);
      return null;
    }
  }

  async healthCheck(source: SourceConfig): Promise<HealthResult> {
    const startTime = Date.now();
    
    try {
      const testVin = source.sampleVins?.[0] || '5YJSA1DN2CFP09123';
      const url = this.buildSearchUrl(source, testVin);
      
      if (!url) {
        return {
          healthy: false,
          latency: 0,
          message: 'No search URL configured',
          checkedAt: new Date(),
        };
      }

      const response = await fetch(url, {
        headers: this.getHeaders(source),
        signal: AbortSignal.timeout(10000),
      });

      return {
        healthy: response.ok,
        latency: Date.now() - startTime,
        message: response.ok ? 'OK' : `HTTP ${response.status}`,
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
    const vins = source.sampleVins || ['5YJSA1DN2CFP09123', '1G1JC524717100001'];
    const errors: string[] = [];
    let successfulVins = 0;
    let totalCompleteness = 0;
    let totalLatency = 0;

    for (const vin of vins) {
      try {
        const startTime = Date.now();
        const results = await this.search(vin, source);
        totalLatency += Date.now() - startTime;

        if (results.length > 0) {
          const vehicle = await this.extract(results[0], source);
          if (vehicle && vehicle.vin) {
            successfulVins++;
            totalCompleteness += vehicle.confidence;
          }
        }
      } catch (error: any) {
        errors.push(`VIN ${vin}: ${error.message}`);
      }
    }

    return {
      valid: successfulVins >= Math.ceil(vins.length * 0.3),
      hitRate: successfulVins / vins.length,
      avgCompleteness: successfulVins > 0 ? totalCompleteness / successfulVins : 0,
      avgLatency: totalLatency / vins.length,
      testedVins: vins.length,
      successfulVins,
      errors,
    };
  }

  // ========== PRIVATE ==========

  private buildSearchUrl(source: SourceConfig, vin: string): string | null {
    const template = source.requestConfig?.searchUrl;
    if (!template) return null;
    return template.replace('{vin}', vin);
  }

  private getHeaders(source: SourceConfig): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...source.requestConfig?.headers,
    };
  }

  private parseSearchResults(html: string, source: SourceConfig, baseUrl: string, targetVin: string): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const selectors = source.selectorConfig || {};

    // Check if target VIN is on page
    if (!findTargetVinInText(html, targetVin)) {
      this.logger.debug(`[${source.name}] Target VIN ${targetVin} not found on search page`);
      // Still return the page - might have partial data
    }

    // Try to find result containers
    const containerSelector = selectors.resultContainer || '.vehicle-card, .search-result, .listing';
    const containers = $(containerSelector);

    if (containers.length > 0) {
      containers.each((i, el) => {
        const $el = $(el);
        const vinText = $el.text().toUpperCase();
        
        // Check if this result contains our target VIN
        if (findTargetVinInText(vinText, targetVin)) {
          // Try to find detail link
          const link = $el.find('a').first().attr('href');
          const detailUrl = link ? normalizeUrl(link, `https://${source.domain}`) : baseUrl;

          results.push({
            url: detailUrl,
            html: $.html($el),
            source: source.name,
            title: $el.find(selectors.title || 'h2, h3, .title').first().text().trim(),
          });
        }
      });
    }

    // If no containers found but VIN is on page, return the whole page
    if (results.length === 0 && findTargetVinInText(html, targetVin)) {
      results.push({
        url: baseUrl,
        html,
        source: source.name,
        title: $('title').text().trim(),
      });
    }

    return results;
  }

  private normalizeFromJson(data: any, source: SourceConfig, url: string): NormalizedVehicle | null {
    if (!data.vin) return null;

    return {
      vin: cleanVin(data.vin),
      title: data.title || data.name,
      price: data.price || data.currentBid,
      saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
      lotNumber: data.lotNumber || data.lot,
      mileage: data.mileage || data.odometer,
      damage: data.damage || data.primaryDamage,
      location: data.location || data.yard,
      images: data.images || [],
      make: data.make,
      model: data.model,
      year: data.year,
      source: source.name,
      sourceUrl: url,
      isAuction: true,
      confidence: 0.7,
      extractedAt: new Date(),
    };
  }

  private extractVin($: CheerioRoot, selector?: string): string | null {
    if (selector) {
      const vinEl = $(selector).first().text().trim().toUpperCase();
      if (isValidVin(vinEl)) return cleanVin(vinEl);
    }

    const bodyText = $('body').text().toUpperCase();
    const vinMatch = bodyText.match(/[A-HJ-NPR-Z0-9]{17}/);
    return vinMatch ? cleanVin(vinMatch[0]) : null;
  }

  private extractText($: CheerioRoot, selector?: string): string | null {
    if (!selector) return null;
    return $(selector).first().text().trim() || null;
  }

  private extractPrice($: CheerioRoot, selector?: string): number | null {
    let text = '';
    if (selector) text = $(selector).first().text();
    if (!text) {
      const match = $('body').text().match(/\$[\d,]+(?:\.\d{2})?/);
      if (match) text = match[0];
    }
    if (text) {
      const price = parseFloat(text.replace(/[$,]/g, ''));
      if (!isNaN(price) && price > 0) return price;
    }
    return null;
  }

  private extractDate($: CheerioRoot, selector?: string): Date | null {
    let text = '';
    if (selector) text = $(selector).first().text();
    if (text) {
      const date = new Date(text);
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  }

  private extractNumber($: CheerioRoot, selector?: string): number | null {
    if (!selector) return null;
    const text = $(selector).first().text();
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    return !isNaN(num) && num > 0 ? num : null;
  }

  private extractImages($: CheerioRoot, selector?: string, domain?: string): string[] {
    const images: string[] = [];
    const seen = new Set<string>();
    const baseUrl = domain ? `https://${domain}` : '';

    $(selector || 'img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && isValidImageUrl(src) && !seen.has(src)) {
        seen.add(src);
        images.push(normalizeUrl(src, baseUrl));
      }
    });

    return images.slice(0, 20);
  }

  private parseVehicleInfo(title: string, vin: string): { make: string | null; model: string | null; year: number | null } {
    let year = decodeYear(vin);
    if (!year) {
      const match = title.match(/\b(19|20)\d{2}\b/);
      if (match) year = parseInt(match[0], 10);
    }

    const wmi = decodeWMI(vin);
    let make: string | null = wmi?.manufacturer !== 'Unknown' ? wmi?.manufacturer || null : null;
    let model: string | null = null;

    const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi', 'Nissan', 'Hyundai', 'Kia', 'Jeep', 'Tesla'];
    for (const m of makes) {
      if (title.toLowerCase().includes(m.toLowerCase())) {
        make = m;
        const regex = new RegExp(`${m}\\s+(\\w+)`, 'i');
        const modelMatch = title.match(regex);
        if (modelMatch) model = modelMatch[1];
        break;
      }
    }

    return { make, model, year };
  }

  private calculateConfidence(fields: Record<string, boolean>): number {
    const weights: Record<string, number> = {
      vin: 0.30, title: 0.10, price: 0.20, images: 0.15,
      saleDate: 0.15, lotNumber: 0.10,
    };
    let score = 0;
    for (const [field, present] of Object.entries(fields)) {
      if (present && weights[field]) score += weights[field];
    }
    return Number(score.toFixed(3));
  }
}
