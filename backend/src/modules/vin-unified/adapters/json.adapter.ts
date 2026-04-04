/**
 * JSON Adapter
 * 
 * Extracts vehicle data from JSON APIs
 * Fast, no scraping needed
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceType, DiscoveredSource, ExtractedVehicle } from '../dto/vin.dto';

@Injectable()
export class JsonAdapter {
  private readonly logger = new Logger(JsonAdapter.name);
  type: SourceType = 'json';

  async extract(vin: string, source: DiscoveredSource): Promise<ExtractedVehicle | null> {
    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.warn(`[JSON] HTTP ${response.status} from ${source.name}`);
        return null;
      }

      const data = await response.json();

      // Try to find vehicle data in common structures
      const vehicle = data.vehicle || data.data || data.result || data;

      if (!vehicle) return null;

      return {
        vin: vehicle.vin || vin,
        title: vehicle.title || vehicle.name,
        year: parseInt(vehicle.year || vehicle.modelYear, 10) || undefined,
        make: vehicle.make || vehicle.manufacturer,
        model: vehicle.model || vehicle.modelName,
        lotNumber: vehicle.lotNumber || vehicle.lot,
        location: vehicle.location || vehicle.yardName,
        saleDate: vehicle.saleDate ? new Date(vehicle.saleDate) : undefined,
        price: parseFloat(vehicle.price || vehicle.currentBid || vehicle.lastBid) || undefined,
        images: Array.isArray(vehicle.images) ? vehicle.images : [],
        damageType: vehicle.damageType || vehicle.primaryDamage,
        mileage: parseInt(vehicle.mileage || vehicle.odometer, 10) || undefined,
        source: source.name,
        sourceUrl: source.url,
        sourceTier: source.tier,
        confidence: 0.7,
        extractedAt: new Date(),
        responseTime: 0,
      };

    } catch (error: any) {
      this.logger.warn(`[JSON] Error from ${source.name}: ${error.message}`);
      return null;
    }
  }
}
