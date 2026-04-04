/**
 * Local VIN Decoder
 * 
 * Декодує VIN без зовнішніх API
 * Базується на стандарті VIN (ISO 3779)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ExtractedVehicle, DiscoveredSource } from '../dto/vin.dto';

// World Manufacturer Identifier (WMI) - перші 3 символи
const WMI_DATABASE: Record<string, { make: string; country: string }> = {
  // USA
  '1G1': { make: 'Chevrolet', country: 'USA' },
  '1G2': { make: 'Pontiac', country: 'USA' },
  '1GC': { make: 'Chevrolet Truck', country: 'USA' },
  '1GT': { make: 'GMC Truck', country: 'USA' },
  '1G6': { make: 'Cadillac', country: 'USA' },
  '1FA': { make: 'Ford', country: 'USA' },
  '1FB': { make: 'Ford', country: 'USA' },
  '1FC': { make: 'Ford', country: 'USA' },
  '1FD': { make: 'Ford', country: 'USA' },
  '1FM': { make: 'Ford', country: 'USA' },
  '1FT': { make: 'Ford Truck', country: 'USA' },
  '1FU': { make: 'Freightliner', country: 'USA' },
  '1FV': { make: 'Freightliner', country: 'USA' },
  '1GY': { make: 'Cadillac', country: 'USA' },
  '1HG': { make: 'Honda', country: 'USA' },
  '1J4': { make: 'Jeep', country: 'USA' },
  '1J8': { make: 'Jeep', country: 'USA' },
  '1L1': { make: 'Lincoln', country: 'USA' },
  '1LN': { make: 'Lincoln', country: 'USA' },
  '1ME': { make: 'Mercury', country: 'USA' },
  '1N4': { make: 'Nissan', country: 'USA' },
  '1N6': { make: 'Nissan Truck', country: 'USA' },
  '1NX': { make: 'Toyota', country: 'USA' },
  '1YV': { make: 'Mazda', country: 'USA' },
  '1ZV': { make: 'Ford', country: 'USA' },
  
  // USA - Tesla
  '5YJ': { make: 'Tesla', country: 'USA' },
  '7SA': { make: 'Tesla', country: 'USA' },
  
  // Japan
  'JA3': { make: 'Mitsubishi', country: 'Japan' },
  'JA4': { make: 'Mitsubishi', country: 'Japan' },
  'JF1': { make: 'Subaru', country: 'Japan' },
  'JF2': { make: 'Subaru', country: 'Japan' },
  'JH4': { make: 'Acura', country: 'Japan' },
  'JHM': { make: 'Honda', country: 'Japan' },
  'JM1': { make: 'Mazda', country: 'Japan' },
  'JM3': { make: 'Mazda', country: 'Japan' },
  'JN1': { make: 'Nissan', country: 'Japan' },
  'JN8': { make: 'Nissan', country: 'Japan' },
  'JT2': { make: 'Toyota', country: 'Japan' },
  'JT3': { make: 'Toyota', country: 'Japan' },
  'JTE': { make: 'Toyota', country: 'Japan' },
  'JTD': { make: 'Toyota', country: 'Japan' },
  'JTH': { make: 'Lexus', country: 'Japan' },
  'JTJ': { make: 'Lexus', country: 'Japan' },
  'JTK': { make: 'Toyota', country: 'Japan' },
  'JTN': { make: 'Toyota', country: 'Japan' },
  
  // Germany
  'WA1': { make: 'Audi', country: 'Germany' },
  'WAU': { make: 'Audi', country: 'Germany' },
  'WBA': { make: 'BMW', country: 'Germany' },
  'WBS': { make: 'BMW M', country: 'Germany' },
  'WBY': { make: 'BMW i', country: 'Germany' },
  'WDB': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDC': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDD': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDF': { make: 'Mercedes-Benz', country: 'Germany' },
  'WF0': { make: 'Ford', country: 'Germany' },
  'WP0': { make: 'Porsche', country: 'Germany' },
  'WP1': { make: 'Porsche', country: 'Germany' },
  'WUA': { make: 'Audi', country: 'Germany' },
  'WVW': { make: 'Volkswagen', country: 'Germany' },
  'WVG': { make: 'Volkswagen', country: 'Germany' },
  
  // UK
  'SAJ': { make: 'Jaguar', country: 'UK' },
  'SAL': { make: 'Land Rover', country: 'UK' },
  'SCC': { make: 'Lotus', country: 'UK' },
  'SCF': { make: 'Aston Martin', country: 'UK' },
  'SFD': { make: 'Alexander Dennis', country: 'UK' },
  
  // Italy
  'ZAM': { make: 'Maserati', country: 'Italy' },
  'ZAR': { make: 'Alfa Romeo', country: 'Italy' },
  'ZFA': { make: 'Fiat', country: 'Italy' },
  'ZFF': { make: 'Ferrari', country: 'Italy' },
  'ZHW': { make: 'Lamborghini', country: 'Italy' },
  
  // Korea
  'KM8': { make: 'Hyundai', country: 'Korea' },
  'KMH': { make: 'Hyundai', country: 'Korea' },
  'KNA': { make: 'Kia', country: 'Korea' },
  'KND': { make: 'Kia', country: 'Korea' },
  '5NP': { make: 'Hyundai', country: 'USA (Korean brand)' },
  '5XY': { make: 'Kia', country: 'USA (Korean brand)' },
  
  // Sweden
  'YV1': { make: 'Volvo', country: 'Sweden' },
  'YV4': { make: 'Volvo', country: 'Sweden' },
  
  // Canada
  '2C3': { make: 'Chrysler', country: 'Canada' },
  '2FA': { make: 'Ford', country: 'Canada' },
  '2FM': { make: 'Ford', country: 'Canada' },
  '2FT': { make: 'Ford Truck', country: 'Canada' },
  '2G1': { make: 'Chevrolet', country: 'Canada' },
  '2HG': { make: 'Honda', country: 'Canada' },
  '2HK': { make: 'Honda', country: 'Canada' },
  '2HM': { make: 'Hyundai', country: 'Canada' },
  '2T1': { make: 'Toyota', country: 'Canada' },
  '2T2': { make: 'Lexus', country: 'Canada' },
  '2T3': { make: 'Toyota', country: 'Canada' },
  
  // Mexico
  '3FA': { make: 'Ford', country: 'Mexico' },
  '3G1': { make: 'Chevrolet', country: 'Mexico' },
  '3GN': { make: 'GMC', country: 'Mexico' },
  '3GT': { make: 'GMC', country: 'Mexico' },
  '3HG': { make: 'Honda', country: 'Mexico' },
  '3N1': { make: 'Nissan', country: 'Mexico' },
  '3VW': { make: 'Volkswagen', country: 'Mexico' },
  
  // China
  'LFV': { make: 'FAW-Volkswagen', country: 'China' },
  'LSG': { make: 'SAIC GM', country: 'China' },
  'LVS': { make: 'Ford Changan', country: 'China' },
};

// Tesla Model codes (position 4)
const TESLA_MODELS: Record<string, string> = {
  'S': 'Model S',
  'X': 'Model X',
  '3': 'Model 3',
  'Y': 'Model Y',
  'R': 'Roadster',
};

// Year code (position 10)
const YEAR_CODES: Record<string, number> = {
  'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
  'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
  'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
  'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029,
  'Y': 2030,
  // Older years (1980-2009)
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
  '6': 2006, '7': 2007, '8': 2008, '9': 2009,
};

@Injectable()
export class LocalVinDecoder {
  private readonly logger = new Logger(LocalVinDecoder.name);

  /**
   * Decode VIN locally without external requests
   */
  decode(vin: string): ExtractedVehicle | null {
    if (!vin || vin.length !== 17) {
      return null;
    }

    const cleanVin = vin.toUpperCase();
    
    // Extract WMI (first 3 characters)
    const wmi = cleanVin.substring(0, 3);
    const wmiInfo = this.findWMI(wmi);
    
    if (!wmiInfo) {
      this.logger.debug(`[LocalDecoder] Unknown WMI: ${wmi}`);
      return null;
    }

    // Extract year (position 10)
    const yearCode = cleanVin.charAt(9);
    const year = YEAR_CODES[yearCode] || null;

    // Extract model for Tesla
    let model: string | null = null;
    if (wmiInfo.make === 'Tesla') {
      const modelCode = cleanVin.charAt(3);
      model = TESLA_MODELS[modelCode] || null;
    }

    const result: ExtractedVehicle = {
      vin: cleanVin,
      title: year && wmiInfo.make ? `${year} ${wmiInfo.make}${model ? ' ' + model : ''}` : undefined,
      year: year || undefined,
      make: wmiInfo.make,
      model: model || undefined,
      images: [],
      source: 'LocalDecoder',
      sourceUrl: '',
      sourceTier: 3,
      confidence: year ? 0.7 : 0.5, // Higher confidence if year decoded
      extractedAt: new Date(),
      responseTime: 0,
    };

    this.logger.log(`[LocalDecoder] Decoded: ${cleanVin} -> ${year} ${wmiInfo.make} ${model || ''}`);
    
    return result;
  }

  private findWMI(wmi: string): { make: string; country: string } | null {
    // Try exact match first
    if (WMI_DATABASE[wmi]) {
      return WMI_DATABASE[wmi];
    }

    // Try first 2 characters (some WMIs)
    const wmi2 = wmi.substring(0, 2);
    for (const [key, value] of Object.entries(WMI_DATABASE)) {
      if (key.startsWith(wmi2)) {
        return value;
      }
    }

    return null;
  }

  /**
   * Create a pseudo-source for local decoder
   */
  getSource(): DiscoveredSource {
    return {
      name: 'LocalDecoder',
      domain: 'local',
      url: '',
      type: 'json',
      tier: 3,
      priority: 50,
      trustScore: 0.7,
    };
  }
}
