/**
 * HTML Detail Adapter
 * 
 * Адаптер для extraction даних з HTML сторінок деталей
 * Працює з detail pages, де VIN вже в URL або на сторінці
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
import { isValidVin, findVinsInText, findTargetVinInText, cleanVin, decodeYear, decodeWMI } from '../../utils/vin.utils';
import { normalizeUrl, isValidImageUrl } from '../../utils/url.utils';

type CheerioRoot = ReturnType<typeof cheerio.load>;

@Injectable()
export class HtmlDetailAdapter implements VinSourceAdapter {
  readonly kind = 'html';
  readonly displayName = 'HTML Detail Parser';
  private readonly logger = new Logger(HtmlDetailAdapter.name);

  canHandle(source: SourceConfig): boolean {
    return source.parserKind === 'html';
  }

  async search(vin: string, source: SourceConfig): Promise<SearchResult[]> {
    const cleanedVin = cleanVin(vin);
    if (!isValidVin(cleanedVin)) return [];

    const url = this.buildUrl(source, cleanedVin);
    if (!url) return [];

    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        headers: this.getHeaders(source),
        signal: AbortSignal.timeout(source.requestConfig?.timeout || 15000),
      });

      if (!response.ok) {
        this.logger.warn(`[${source.name}] HTTP ${response.status} for ${url}`);
        return [];
      }

      const html = await response.text();
      const latency = Date.now() - startTime;

      this.logger.debug(`[${source.name}] Fetched ${html.length} bytes in ${latency}ms`);

      return [{
        url,
        html,
        source: source.name,
        title: '',
      }];
    } catch (error: any) {
      this.logger.warn(`[${source.name}] Fetch error: ${error.message}`);
      return [];
    }
  }

  async extract(input: SearchResult, source: SourceConfig): Promise<NormalizedVehicle | null> {
    if (!input.html) return null;

    try {
      const $ = cheerio.load(input.html);
      const selectors = source.selectorConfig || {};

      // Extract VIN
      const vin = this.extractVin($, selectors.vin);
      if (!vin) {
        this.logger.debug(`[${source.name}] No VIN found`);
        return null;
      }

      // Extract all fields
      const title = this.extractText($, selectors.title) || this.extractPageTitle($);
      const price = this.extractPrice($, selectors.price);
      const saleDate = this.extractDate($, selectors.saleDate);
      const lotNumber = this.extractText($, selectors.lotNumber);
      const mileage = this.extractNumber($, selectors.mileage);
      const damage = this.extractText($, selectors.damage);
      const location = this.extractText($, selectors.location) || this.extractLocation($);
      const images = this.extractImages($, selectors.images, source.domain);

      // Parse vehicle info
      const vehicleInfo = this.parseVehicleInfo(title || '', vin);

      // Calculate confidence
      const confidence = this.calculateConfidence({
        vin: true,
        title: !!title,
        price: price !== null,
        images: images.length > 0,
        saleDate: !!saleDate,
        lotNumber: !!lotNumber,
        mileage: mileage !== null,
        damage: !!damage,
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
        rawMeta: {
          htmlLength: input.html.length,
          selectorsUsed: Object.keys(selectors).filter(k => selectors[k]),
        },
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
      const results = await this.search(testVin, source);
      
      return {
        healthy: results.length > 0,
        latency: Date.now() - startTime,
        message: results.length > 0 ? 'OK' : 'No results',
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
      valid: successfulVins >= Math.ceil(vins.length * 0.4),
      hitRate: successfulVins / vins.length,
      avgCompleteness: successfulVins > 0 ? totalCompleteness / successfulVins : 0,
      avgLatency: totalLatency / vins.length,
      testedVins: vins.length,
      successfulVins,
      errors,
    };
  }

  // ========== PRIVATE METHODS ==========

  private buildUrl(source: SourceConfig, vin: string): string | null {
    const template = source.requestConfig?.searchUrl || source.requestConfig?.detailUrl;
    if (!template) return null;
    return template.replace('{vin}', vin);
  }

  private getHeaders(source: SourceConfig): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Cache-Control': 'no-cache',
      ...source.requestConfig?.headers,
    };
  }

  private extractVin($: CheerioRoot, selector?: string): string | null {
    // Try selector first
    if (selector) {
      const vinEl = $(selector).first().text().trim().toUpperCase();
      if (isValidVin(vinEl)) return cleanVin(vinEl);
    }

    // Fallback: search in body
    const bodyText = $('body').text();
    const vins = findVinsInText(bodyText);
    return vins[0] || null;
  }

  private extractText($: CheerioRoot, selector?: string): string | null {
    if (!selector) return null;
    const text = $(selector).first().text().trim();
    return text || null;
  }

  private extractPageTitle($: CheerioRoot): string | null {
    const title = $('title').text().trim();
    if (!title) return null;
    // Clean up common suffixes
    return title.replace(/\s*[-|]\s*.*$/, '').trim();
  }

  private extractPrice($: CheerioRoot, selector?: string): number | null {
    let priceText = '';
    
    if (selector) {
      priceText = $(selector).first().text();
    }

    if (!priceText) {
      // Fallback: search for price patterns
      const bodyText = $('body').text();
      const priceMatch = bodyText.match(/\$[\d,]+(?:\.\d{2})?/);
      if (priceMatch) priceText = priceMatch[0];
    }

    if (priceText) {
      const price = parseFloat(priceText.replace(/[$,]/g, ''));
      if (!isNaN(price) && price > 0 && price < 1000000) {
        return price;
      }
    }

    return null;
  }

  private extractDate($: CheerioRoot, selector?: string): Date | null {
    let dateText = '';

    if (selector) {
      dateText = $(selector).first().text();
    }

    if (!dateText) {
      const bodyText = $('body').text();
      const datePatterns = [
        /\d{4}-\d{2}-\d{2}/,
        /\d{2}\/\d{2}\/\d{4}/,
        /\w+ \d{1,2}, \d{4}/,
        /\d{1,2} \w+ \d{4}/,
      ];

      for (const pattern of datePatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          dateText = match[0];
          break;
        }
      }
    }

    if (dateText) {
      const date = new Date(dateText);
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  }

  private extractNumber($: CheerioRoot, selector?: string): number | null {
    if (!selector) return null;
    const text = $(selector).first().text();
    if (!text) return null;

    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > 0) return num;

    return null;
  }

  private extractImages($: CheerioRoot, selector?: string, domain?: string): string[] {
    const images: string[] = [];
    const seen = new Set<string>();
    const imgSelector = selector || 'img';
    const baseUrl = domain ? `https://${domain}` : '';

    $(imgSelector).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
      
      if (src && isValidImageUrl(src) && !seen.has(src)) {
        seen.add(src);
        const normalized = normalizeUrl(src, baseUrl);
        images.push(normalized);
      }
    });

    return images.slice(0, 20);
  }

  private extractLocation($: CheerioRoot): string | null {
    const selectors = ['.location', '.yard', '.facility', '[data-location]'];
    
    for (const selector of selectors) {
      const loc = $(selector).first().text().trim();
      if (loc) return loc;
    }

    // Try to find state abbreviation
    const bodyText = $('body').text();
    const stateMatch = bodyText.match(/([A-Z]{2})\s*\d{5}/);
    return stateMatch?.[1] || null;
  }

  private parseVehicleInfo(title: string, vin: string): { make: string | null; model: string | null; year: number | null } {
    // Try to decode year from VIN
    let year = decodeYear(vin);
    
    // Try to find year in title
    if (!year) {
      const yearMatch = title.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) year = parseInt(yearMatch[0], 10);
    }

    // Known makes
    const makes = [
      'Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi',
      'Volkswagen', 'Nissan', 'Hyundai', 'Kia', 'Mazda', 'Subaru', 'Lexus',
      'Jeep', 'Dodge', 'Ram', 'GMC', 'Cadillac', 'Buick', 'Lincoln',
      'Acura', 'Infiniti', 'Porsche', 'Tesla', 'Volvo', 'Land Rover',
      'Chrysler', 'Mitsubishi', 'Fiat', 'Alfa Romeo', 'Jaguar', 'Mini',
    ];

    let make: string | null = null;
    let model: string | null = null;

    // Try WMI decode
    const wmi = decodeWMI(vin);
    if (wmi && wmi.manufacturer !== 'Unknown') {
      make = wmi.manufacturer;
    }

    // Search in title
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
      vin: 0.30,
      title: 0.10,
      price: 0.15,
      images: 0.15,
      saleDate: 0.10,
      lotNumber: 0.10,
      mileage: 0.05,
      damage: 0.05,
    };

    let score = 0;
    for (const [field, present] of Object.entries(fields)) {
      if (present && weights[field]) {
        score += weights[field];
      }
    }

    return Number(score.toFixed(3));
  }
}
