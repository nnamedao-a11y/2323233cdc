/**
 * Competitor Parser Service
 * 
 * Smart HTML extraction з сайтів конкурентів
 * Використовує cheerio для parsing + regex для fallback
 */

import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { CompetitorSource } from './competitor.config';

type CheerioRoot = ReturnType<typeof cheerio.load>;

export interface ParsedCompetitorData {
  vin: string | null;
  title: string | null;
  price: number | null;
  images: string[];
  saleDate: Date | null;
  lotNumber: string | null;
  mileage: number | null;
  damageType: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  location: string | null;
  sourceName: string;
  sourceUrl: string;
  confidence: number;
  raw?: Record<string, any>;
}

@Injectable()
export class CompetitorParserService {
  private readonly logger = new Logger(CompetitorParserService.name);

  /**
   * Parse HTML from competitor site
   */
  async parse(
    html: string,
    source: CompetitorSource,
    sourceUrl: string,
    targetVin: string,
  ): Promise<ParsedCompetitorData | null> {
    try {
      const $ = cheerio.load(html);

      // Extract VIN
      const vin = this.extractVin($, source, targetVin);
      
      // Validate VIN matches target
      if (!vin || vin.toUpperCase() !== targetVin.toUpperCase()) {
        this.logger.debug(`VIN mismatch: expected ${targetVin}, got ${vin}`);
        return null;
      }

      // Extract all data
      const title = this.extractTitle($, source);
      const price = this.extractPrice($, source);
      const images = this.extractImages($, source);
      const saleDate = this.extractDate($, source);
      const lotNumber = this.extractLotNumber($, source);
      const mileage = this.extractMileage($, source);
      const damageType = this.extractDamageType($, source);
      
      // Parse vehicle info from title
      const vehicleInfo = this.parseVehicleInfo(title || '');

      // Calculate confidence based on data completeness
      const confidence = this.calculateConfidence({
        vin,
        title,
        price,
        images,
        saleDate,
        lotNumber,
        mileage,
      });

      return {
        vin,
        title,
        price,
        images,
        saleDate,
        lotNumber,
        mileage,
        damageType,
        make: vehicleInfo.make,
        model: vehicleInfo.model,
        year: vehicleInfo.year,
        location: this.extractLocation($),
        sourceName: source.name,
        sourceUrl,
        confidence,
        raw: {
          htmlLength: html.length,
          extractedAt: new Date(),
        },
      };
    } catch (error: any) {
      this.logger.error(`Parse error for ${source.name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract VIN from HTML
   */
  private extractVin(
    $: CheerioRoot,
    source: CompetitorSource,
    targetVin: string,
  ): string | null {
    // Try selector first
    if (source.selectors?.vin) {
      const vinEl = $(source.selectors.vin).first().text().trim();
      if (vinEl && this.isValidVin(vinEl)) {
        return vinEl.toUpperCase();
      }
    }

    // Fallback: search in body text
    const bodyText = $('body').text().toUpperCase();
    
    // First try to find the target VIN
    if (bodyText.includes(targetVin.toUpperCase())) {
      return targetVin.toUpperCase();
    }

    // Then try regex
    const vinRegex = /[A-HJ-NPR-Z0-9]{17}/g;
    const matches = bodyText.match(vinRegex);
    
    if (matches) {
      // Prefer the target VIN if found
      const targetMatch = matches.find(m => m === targetVin.toUpperCase());
      if (targetMatch) return targetMatch;
      
      // Otherwise return first valid VIN
      return matches[0];
    }

    return null;
  }

  /**
   * Extract title
   */
  private extractTitle($: CheerioRoot, source: CompetitorSource): string | null {
    if (source.selectors?.title) {
      const title = $(source.selectors.title).first().text().trim();
      if (title) return title;
    }

    // Fallback to page title
    const pageTitle = $('title').text().trim();
    if (pageTitle) {
      // Clean up common suffixes
      return pageTitle
        .replace(/\s*[-|]\s*.*$/, '')
        .replace(/Search Results.*$/i, '')
        .trim();
    }

    // Try h1
    const h1 = $('h1').first().text().trim();
    return h1 || null;
  }

  /**
   * Extract price
   */
  private extractPrice($: CheerioRoot, source: CompetitorSource): number | null {
    let priceText = '';

    if (source.selectors?.price) {
      priceText = $(source.selectors.price).first().text();
    }

    if (!priceText) {
      // Fallback: search for price patterns
      const bodyText = $('body').text();
      const priceMatch = bodyText.match(/\$[\d,]+(?:\.\d{2})?/);
      if (priceMatch) {
        priceText = priceMatch[0];
      }
    }

    if (priceText) {
      const price = parseFloat(priceText.replace(/[$,]/g, ''));
      if (!isNaN(price) && price > 0 && price < 1000000) {
        return price;
      }
    }

    return null;
  }

  /**
   * Extract images
   */
  private extractImages($: CheerioRoot, source: CompetitorSource): string[] {
    const images: string[] = [];
    const seen = new Set<string>();

    const selector = source.selectors?.images || 'img';
    
    $(selector).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
      
      if (src && this.isValidImageUrl(src) && !seen.has(src)) {
        seen.add(src);
        images.push(this.normalizeImageUrl(src, source.baseUrl));
      }
    });

    // Limit to 20 images
    return images.slice(0, 20);
  }

  /**
   * Extract sale date
   */
  private extractDate($: CheerioRoot, source: CompetitorSource): Date | null {
    let dateText = '';

    if (source.selectors?.saleDate) {
      dateText = $(source.selectors.saleDate).first().text();
    }

    if (!dateText) {
      const bodyText = $('body').text();
      // Try various date formats
      const datePatterns = [
        /\d{4}-\d{2}-\d{2}/,           // 2024-01-15
        /\d{2}\/\d{2}\/\d{4}/,         // 01/15/2024
        /\w+ \d{1,2}, \d{4}/,          // January 15, 2024
        /\d{1,2} \w+ \d{4}/,           // 15 January 2024
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
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }

  /**
   * Extract lot number
   */
  private extractLotNumber($: CheerioRoot, source: CompetitorSource): string | null {
    if (source.selectors?.lotNumber) {
      const lot = $(source.selectors.lotNumber).first().text().trim();
      if (lot) return lot;
    }

    // Fallback regex
    const bodyText = $('body').text();
    const lotMatch = bodyText.match(/lot\s*#?\s*:?\s*(\d+)/i);
    return lotMatch?.[1] || null;
  }

  /**
   * Extract mileage
   */
  private extractMileage($: CheerioRoot, source: CompetitorSource): number | null {
    let mileageText = '';

    if (source.selectors?.mileage) {
      mileageText = $(source.selectors.mileage).first().text();
    }

    if (!mileageText) {
      const bodyText = $('body').text();
      const mileageMatch = bodyText.match(/(\d{1,3}(?:,\d{3})*)\s*(?:miles?|mi|km)/i);
      if (mileageMatch) {
        mileageText = mileageMatch[1];
      }
    }

    if (mileageText) {
      const mileage = parseInt(mileageText.replace(/,/g, ''), 10);
      if (!isNaN(mileage) && mileage > 0 && mileage < 1000000) {
        return mileage;
      }
    }

    return null;
  }

  /**
   * Extract damage type
   */
  private extractDamageType($: CheerioRoot, source: CompetitorSource): string | null {
    if (source.selectors?.damageType) {
      const damage = $(source.selectors.damageType).first().text().trim();
      if (damage) return damage;
    }

    // Fallback: common damage keywords
    const bodyText = $('body').text().toLowerCase();
    const damageTypes = [
      'front end', 'rear end', 'side', 'rollover', 'flood', 
      'fire', 'vandalism', 'hail', 'mechanical', 'unknown'
    ];

    for (const type of damageTypes) {
      if (bodyText.includes(type)) {
        return type.charAt(0).toUpperCase() + type.slice(1);
      }
    }

    return null;
  }

  /**
   * Extract location
   */
  private extractLocation($: CheerioRoot): string | null {
    const locationSelectors = ['.location', '.yard', '.facility', '[data-location]'];
    
    for (const selector of locationSelectors) {
      const loc = $(selector).first().text().trim();
      if (loc) return loc;
    }

    // Try to find state abbreviations
    const bodyText = $('body').text();
    const stateMatch = bodyText.match(/([A-Z]{2})\s*\d{5}/);
    return stateMatch?.[1] || null;
  }

  /**
   * Parse vehicle info from title
   */
  private parseVehicleInfo(title: string): { make: string | null; model: string | null; year: number | null } {
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

    const makes = [
      'Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi',
      'Volkswagen', 'Nissan', 'Hyundai', 'Kia', 'Mazda', 'Subaru', 'Lexus',
      'Jeep', 'Dodge', 'Ram', 'GMC', 'Cadillac', 'Buick', 'Lincoln',
      'Acura', 'Infiniti', 'Porsche', 'Tesla', 'Volvo', 'Land Rover',
    ];

    let make: string | null = null;
    let model: string | null = null;

    for (const m of makes) {
      if (title.toLowerCase().includes(m.toLowerCase())) {
        make = m;
        // Try to get model (word after make)
        const regex = new RegExp(`${m}\\s+(\\w+)`, 'i');
        const modelMatch = title.match(regex);
        if (modelMatch) {
          model = modelMatch[1];
        }
        break;
      }
    }

    return { make, model, year };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(data: Record<string, any>): number {
    let score = 0;
    const weights = {
      vin: 0.3,
      title: 0.1,
      price: 0.2,
      images: 0.15,
      saleDate: 0.1,
      lotNumber: 0.1,
      mileage: 0.05,
    };

    if (data.vin) score += weights.vin;
    if (data.title) score += weights.title;
    if (data.price && data.price > 0) score += weights.price;
    if (data.images && data.images.length > 0) score += weights.images;
    if (data.saleDate) score += weights.saleDate;
    if (data.lotNumber) score += weights.lotNumber;
    if (data.mileage && data.mileage > 0) score += weights.mileage;

    return Number(score.toFixed(3));
  }

  /**
   * Validate VIN format
   */
  private isValidVin(vin: string): boolean {
    const cleaned = vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
    return cleaned.length === 17;
  }

  /**
   * Validate image URL
   */
  private isValidImageUrl(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('data:')) return false;
    if (url.includes('placeholder')) return false;
    if (url.includes('loading')) return false;
    if (url.includes('spacer')) return false;
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const hasExtension = imageExtensions.some(ext => url.toLowerCase().includes(ext));
    const isAbsolute = url.startsWith('http') || url.startsWith('//');
    
    return hasExtension || isAbsolute;
  }

  /**
   * Normalize image URL to absolute
   */
  private normalizeImageUrl(url: string, baseUrl: string): string {
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    if (url.startsWith('/')) {
      return baseUrl + url;
    }
    if (!url.startsWith('http')) {
      return baseUrl + '/' + url;
    }
    return url;
  }
}
