/**
 * VIN Extraction Service
 * 
 * Витягує дані з URL через різні парсер-методи
 * Інтегрує: NHTSA API, HTTP fetch, Puppeteer
 */

import { Injectable, Logger } from '@nestjs/common';
import { DiscoveredUrl } from '../interfaces/discovered-url.interface';
import { ExtractedVehicle } from '../interfaces/extracted-vehicle.interface';
import { PuppeteerHtmlAdapter } from './puppeteer-html.adapter';
import * as https from 'https';
import * as http from 'http';

@Injectable()
export class VinExtractionService {
  private readonly logger = new Logger(VinExtractionService.name);

  constructor(
    private readonly puppeteerAdapter: PuppeteerHtmlAdapter,
  ) {}

  async extractAll(vin: string, discovered: DiscoveredUrl[]): Promise<ExtractedVehicle[]> {
    const results: ExtractedVehicle[] = [];
    const normalizedVin = vin.trim().toUpperCase();

    // Separate by extraction method
    const nhtsaSources = discovered.filter(d => d.parserKind === 'nhtsa');
    const jsonSources = discovered.filter(d => d.parserKind === 'json_api');
    const htmlSources = discovered.filter(d => d.parserKind === 'html_detail' || d.parserKind === 'search_form');

    // 1. NHTSA first (fastest, most reliable)
    for (const item of nhtsaSources) {
      const result = await this.extractNHTSA(normalizedVin, item);
      if (result) results.push(result);
    }

    // 2. JSON APIs (fast)
    const jsonPromises = jsonSources.map(item => this.extractJSON(normalizedVin, item));
    const jsonResults = await Promise.allSettled(jsonPromises);
    for (const r of jsonResults) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }

    // 3. HTML sources via Puppeteer (slower but more complete)
    if (htmlSources.length > 0) {
      const puppeteerResults = await this.puppeteerAdapter.extractMultiple(normalizedVin, htmlSources);
      results.push(...puppeteerResults);
    }

    this.logger.log(`[Extraction] Extracted ${results.length}/${discovered.length} sources`);
    return results;
  }

  /**
   * Extract from NHTSA API (always reliable)
   */
  private async extractNHTSA(vin: string, item: DiscoveredUrl): Promise<ExtractedVehicle | null> {
    const data = await this.fetchJSON(item.url);
    
    if (!data?.Results || !Array.isArray(data.Results)) {
      return null;
    }

    const results = data.Results;
    const getValue = (variable: string): string | undefined => {
      const found = results.find((r: any) => r.Variable === variable);
      return found?.Value && found.Value !== 'Not Applicable' ? found.Value : undefined;
    };

    const year = parseInt(getValue('Model Year') || '0', 10) || undefined;
    const make = getValue('Make');
    const model = getValue('Model');

    if (!make && !model) {
      return null;
    }

    return {
      vin,
      title: `${year || ''} ${make || ''} ${model || ''}`.trim() || undefined,
      year,
      make,
      model,
      source: item.sourceName,
      sourceUrl: item.url,
      confidence: 0.95, // NHTSA is very reliable for decode
      rawMeta: { nhtsa: true },
    };
  }

  /**
   * Extract from JSON API
   */
  private async extractJSON(vin: string, item: DiscoveredUrl): Promise<ExtractedVehicle | null> {
    const data = await this.fetchJSON(item.url);
    
    if (!data) {
      return null;
    }

    // Try to find vehicle data in common structures
    const vehicle = data.vehicle || data.data || data.result || data;

    return {
      vin: vehicle.vin || vin,
      title: vehicle.title || vehicle.name,
      year: parseInt(vehicle.year || vehicle.modelYear, 10) || undefined,
      make: vehicle.make || vehicle.manufacturer,
      model: vehicle.model || vehicle.modelName,
      lotNumber: vehicle.lotNumber || vehicle.lot,
      location: vehicle.location || vehicle.yardName,
      saleDate: vehicle.saleDate || vehicle.auctionDate,
      price: parseFloat(vehicle.price || vehicle.currentBid || vehicle.lastBid) || undefined,
      images: Array.isArray(vehicle.images) ? vehicle.images : [],
      damageType: vehicle.damageType || vehicle.primaryDamage,
      mileage: parseInt(vehicle.mileage || vehicle.odometer, 10) || undefined,
      source: item.sourceName,
      sourceUrl: item.url,
      confidence: 0.7,
    };
  }

  /**
   * Fetch JSON from URL
   */
  private fetchJSON(url: string): Promise<any> {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;
      const timeout = setTimeout(() => resolve(null), 10000);

      try {
        client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            clearTimeout(timeout);
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          });
        }).on('error', () => {
          clearTimeout(timeout);
          resolve(null);
        });
      } catch {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }
}
