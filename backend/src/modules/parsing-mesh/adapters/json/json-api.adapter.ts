/**
 * JSON API Adapter
 * 
 * Адаптер для джерел з JSON/XHR API endpoints
 * Працює з публічними API та data blobs
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  VinSourceAdapter,
  SourceConfig,
  SearchResult,
  NormalizedVehicle,
  HealthResult,
  SourceValidationResult,
} from '../interfaces/vin-source-adapter.interface';
import { isValidVin, cleanVin, decodeYear, decodeWMI } from '../../utils/vin.utils';

@Injectable()
export class JsonApiAdapter implements VinSourceAdapter {
  readonly kind = 'json';
  readonly displayName = 'JSON API Parser';
  private readonly logger = new Logger(JsonApiAdapter.name);

  canHandle(source: SourceConfig): boolean {
    return source.parserKind === 'json';
  }

  async search(vin: string, source: SourceConfig): Promise<SearchResult[]> {
    const cleanedVin = cleanVin(vin);
    if (!isValidVin(cleanedVin)) return [];

    const url = this.buildUrl(source, cleanedVin);
    if (!url) return [];

    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: source.requestConfig?.method || 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...source.requestConfig?.headers,
        },
        signal: AbortSignal.timeout(source.requestConfig?.timeout || 15000),
      });

      if (!response.ok) {
        this.logger.warn(`[${source.name}] HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      this.logger.debug(`[${source.name}] JSON fetched in ${latency}ms`);

      // Handle different response structures
      const items = this.extractItems(data, source);

      return items.map(item => ({
        url,
        json: item,
        source: source.name,
        title: item.title || item.name || '',
      }));
    } catch (error: any) {
      this.logger.warn(`[${source.name}] JSON fetch error: ${error.message}`);
      return [];
    }
  }

  async extract(input: SearchResult, source: SourceConfig): Promise<NormalizedVehicle | null> {
    if (!input.json) return null;

    try {
      const data = input.json;
      const mapping = source.selectorConfig || {};

      // Map fields using config or defaults
      const vin = this.getValue(data, mapping.vin || 'vin') ||
                  this.getValue(data, 'VIN') ||
                  this.getValue(data, 'vinCode');
      
      if (!vin || !isValidVin(vin)) return null;

      const cleanedVin = cleanVin(vin);
      const vehicleInfo = this.parseVehicleInfo(data, cleanedVin);

      return {
        vin: cleanedVin,
        title: this.getValue(data, mapping.title || 'title') ||
               this.getValue(data, 'name') ||
               this.getValue(data, 'vehicleName'),
        price: this.getNumber(data, mapping.price || 'price') ||
               this.getNumber(data, 'currentBid') ||
               this.getNumber(data, 'highBid'),
        saleDate: this.getDate(data, mapping.saleDate || 'saleDate') ||
                  this.getDate(data, 'auctionDate'),
        lotNumber: this.getValue(data, mapping.lotNumber || 'lotNumber') ||
                   this.getValue(data, 'lot') ||
                   this.getValue(data, 'stockNumber'),
        mileage: this.getNumber(data, mapping.mileage || 'mileage') ||
                 this.getNumber(data, 'odometer'),
        damage: this.getValue(data, mapping.damage || 'damage') ||
                this.getValue(data, 'primaryDamage') ||
                this.getValue(data, 'damageDescription'),
        location: this.getValue(data, mapping.location || 'location') ||
                  this.getValue(data, 'yard') ||
                  this.getValue(data, 'branch'),
        images: this.getImages(data),
        make: vehicleInfo.make,
        model: vehicleInfo.model,
        year: vehicleInfo.year,
        source: source.name,
        sourceUrl: input.url,
        isAuction: !!(this.getValue(data, 'lotNumber') || this.getValue(data, 'auctionDate')),
        confidence: this.calculateConfidence(data),
        extractedAt: new Date(),
        rawMeta: data,
      };
    } catch (error: any) {
      this.logger.error(`[${source.name}] JSON extract error: ${error.message}`);
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
    const vins = source.sampleVins || ['5YJSA1DN2CFP09123'];
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
          if (vehicle) {
            successfulVins++;
            totalCompleteness += vehicle.confidence;
          }
        }
      } catch (error: any) {
        errors.push(`VIN ${vin}: ${error.message}`);
      }
    }

    return {
      valid: successfulVins > 0,
      hitRate: successfulVins / vins.length,
      avgCompleteness: successfulVins > 0 ? totalCompleteness / successfulVins : 0,
      avgLatency: totalLatency / vins.length,
      testedVins: vins.length,
      successfulVins,
      errors,
    };
  }

  // ========== PRIVATE ==========

  private buildUrl(source: SourceConfig, vin: string): string | null {
    const template = source.requestConfig?.searchUrl || source.requestConfig?.detailUrl;
    if (!template) return null;
    return template.replace('{vin}', vin);
  }

  private extractItems(data: any, source: SourceConfig): any[] {
    // Handle different response structures
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.results && Array.isArray(data.results)) return data.results;
    if (data.items && Array.isArray(data.items)) return data.items;
    if (data.vehicles && Array.isArray(data.vehicles)) return data.vehicles;
    if (data.lots && Array.isArray(data.lots)) return data.lots;
    
    // Single object response
    if (data.vin || data.VIN || data.lotNumber) return [data];
    
    return [];
  }

  private getValue(data: any, path: string): string | null {
    if (!data || !path) return null;
    
    const parts = path.split('.');
    let value = data;
    
    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }
    
    return value !== null && value !== undefined ? String(value).trim() : null;
  }

  private getNumber(data: any, path: string): number | null {
    const value = this.getValue(data, path);
    if (!value) return null;
    
    const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return !isNaN(num) && num > 0 ? num : null;
  }

  private getDate(data: any, path: string): Date | null {
    const value = this.getValue(data, path);
    if (!value) return null;
    
    const date = new Date(value);
    return !isNaN(date.getTime()) ? date : null;
  }

  private getImages(data: any): string[] {
    // Try different image field names
    const imageFields = ['images', 'photos', 'imageUrls', 'tims', 'thumbnails'];
    
    for (const field of imageFields) {
      if (data[field]) {
        if (Array.isArray(data[field])) {
          // Handle array of strings or objects
          return data[field].map((img: any) => {
            if (typeof img === 'string') return img;
            return img.url || img.src || img.full || img.large || '';
          }).filter(Boolean).slice(0, 20);
        }
      }
    }
    
    return [];
  }

  private parseVehicleInfo(data: any, vin: string): { make: string | null; model: string | null; year: number | null } {
    let make = this.getValue(data, 'make') || this.getValue(data, 'manufacturer');
    let model = this.getValue(data, 'model') || this.getValue(data, 'modelName');
    let year: number | null = this.getNumber(data, 'year') || this.getNumber(data, 'modelYear');

    // Try VIN decode
    if (!year) year = decodeYear(vin);
    
    const wmi = decodeWMI(vin);
    if (!make && wmi && wmi.manufacturer !== 'Unknown') {
      make = wmi.manufacturer;
    }

    return { make, model, year };
  }

  private calculateConfidence(data: any): number {
    let score = 0;
    const checks = [
      ['vin', 0.25],
      ['title', 0.10],
      ['price', 0.15],
      ['images', 0.15],
      ['saleDate', 0.10],
      ['lotNumber', 0.10],
      ['mileage', 0.05],
      ['damage', 0.05],
      ['make', 0.025],
      ['model', 0.025],
    ] as const;

    for (const [field, weight] of checks) {
      const value = data[field];
      if (value !== null && value !== undefined && value !== '' && 
          (Array.isArray(value) ? value.length > 0 : true)) {
        score += weight;
      }
    }

    return Number(Math.min(1, score).toFixed(3));
  }
}
