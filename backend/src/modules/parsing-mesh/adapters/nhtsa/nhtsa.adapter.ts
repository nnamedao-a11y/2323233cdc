/**
 * NHTSA VIN Decoder Adapter
 * 
 * Офіційне API від NHTSA (National Highway Traffic Safety Administration)
 * 100% reliable, без anti-bot, безкоштовне
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
import { isValidVin, cleanVin, decodeYear } from '../../utils/vin.utils';

interface NHTSAResult {
  Variable: string;
  Value: string | null;
  VariableId: number;
  ValueId: string;
}

interface NHTSAResponse {
  Count: number;
  Message: string;
  Results: NHTSAResult[];
  SearchCriteria: string;
}

@Injectable()
export class NhtsaAdapter implements VinSourceAdapter {
  readonly kind = 'nhtsa';
  readonly displayName = 'NHTSA Official VIN Decoder';
  private readonly logger = new Logger(NhtsaAdapter.name);
  
  private readonly API_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevin';

  canHandle(source: SourceConfig): boolean {
    return source.parserKind === 'nhtsa' || source.name === 'nhtsa_official';
  }

  async search(vin: string, source: SourceConfig): Promise<SearchResult[]> {
    const cleanedVin = cleanVin(vin);
    if (!isValidVin(cleanedVin)) return [];

    try {
      const url = `${this.API_URL}/${cleanedVin}?format=json`;
      const startTime = Date.now();
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BIBI-Cars-CRM/3.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`NHTSA API error: HTTP ${response.status}`);
        return [];
      }

      const data: NHTSAResponse = await response.json();
      const latency = Date.now() - startTime;

      this.logger.debug(`NHTSA fetched in ${latency}ms`);

      return [{
        url,
        json: data,
        source: 'nhtsa_official',
        title: `NHTSA Decode: ${cleanedVin}`,
      }];
    } catch (error: any) {
      this.logger.warn(`NHTSA fetch error: ${error.message}`);
      return [];
    }
  }

  async extract(input: SearchResult, source: SourceConfig): Promise<NormalizedVehicle | null> {
    if (!input.json) return null;

    try {
      const data: NHTSAResponse = input.json;
      const results = data.Results;

      // Check for errors
      const errorCode = this.getValue(results, 'Error Code');
      if (errorCode && errorCode !== '0') {
        const errorText = this.getValue(results, 'Error Text');
        this.logger.debug(`NHTSA decode issue: ${errorText}`);
        // Continue anyway - partial data may still be useful
      }

      // Extract VIN from response or use from search criteria
      const vin = data.SearchCriteria?.replace('VIN:', '').trim() || 
                  cleanVin(this.getValue(results, 'VIN') || '');
      
      if (!vin || !isValidVin(vin)) {
        return null;
      }

      // Extract vehicle info
      const make = this.getValue(results, 'Make');
      const model = this.getValue(results, 'Model');
      const year = parseInt(this.getValue(results, 'Model Year') || '', 10) || null;
      const vehicleType = this.getValue(results, 'Vehicle Type');
      const bodyClass = this.getValue(results, 'Body Class');
      const driveType = this.getValue(results, 'Drive Type');
      const fuelType = this.getValue(results, 'Fuel Type - Primary');
      const transmission = this.getValue(results, 'Transmission Style');
      const engineSize = this.getValue(results, 'Displacement (L)');
      const manufacturerName = this.getValue(results, 'Manufacturer Name');
      const plantCity = this.getValue(results, 'Plant City');
      const plantCountry = this.getValue(results, 'Plant Country');

      // Build title
      const title = [year, make, model].filter(Boolean).join(' ');

      // Calculate confidence based on data completeness
      const fieldsPresent = [make, model, year, vehicleType].filter(Boolean).length;
      const confidence = Math.min(0.8, 0.4 + (fieldsPresent * 0.1));

      return {
        vin,
        title: title || null,
        make: make || null,
        model: model || null,
        year,
        driveType: driveType || null,
        fuelType: fuelType || null,
        transmission: transmission || null,
        engineSize: engineSize ? `${engineSize}L` : null,
        source: 'nhtsa_official',
        sourceUrl: input.url,
        images: [],
        isAuction: false,
        confidence,
        extractedAt: new Date(),
        rawMeta: {
          vehicleType,
          bodyClass,
          manufacturerName,
          plantCity,
          plantCountry,
          errorCode,
        },
      };
    } catch (error: any) {
      this.logger.error(`NHTSA extract error: ${error.message}`);
      return null;
    }
  }

  async healthCheck(source: SourceConfig): Promise<HealthResult> {
    const startTime = Date.now();
    
    try {
      // Use a known valid VIN for health check
      const testVin = '5YJSA1DN2CFP09123'; // Tesla Model S
      const url = `${this.API_URL}/${testVin}?format=json`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
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
    const testVins = [
      '5YJSA1DN2CFP09123', // Tesla Model S 2012
      '1HGBH41JXMN109186', // Honda Accord
      'WVWZZZ3CZWE123456', // VW
    ];
    
    let successfulVins = 0;
    let totalCompleteness = 0;
    let totalLatency = 0;
    const errors: string[] = [];

    for (const vin of testVins) {
      try {
        const startTime = Date.now();
        const results = await this.search(vin, source);
        totalLatency += Date.now() - startTime;

        if (results.length > 0) {
          const vehicle = await this.extract(results[0], source);
          if (vehicle && vehicle.make && vehicle.model) {
            successfulVins++;
            totalCompleteness += vehicle.confidence;
          }
        }
      } catch (error: any) {
        errors.push(`VIN ${vin}: ${error.message}`);
      }
    }

    return {
      valid: successfulVins >= 2,
      hitRate: successfulVins / testVins.length,
      avgCompleteness: successfulVins > 0 ? totalCompleteness / successfulVins : 0,
      avgLatency: totalLatency / testVins.length,
      testedVins: testVins.length,
      successfulVins,
      errors,
    };
  }

  private getValue(results: NHTSAResult[], variableName: string): string | null {
    const result = results.find(r => r.Variable === variableName);
    return result?.Value || null;
  }
}
