/**
 * Adapter Registry
 * 
 * Manages all extraction adapters (SCRAPING ONLY - NO API)
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceType, DiscoveredSource, ExtractedVehicle } from '../dto/vin.dto';
import { JsonAdapter } from './json.adapter';
import { HtmlLightAdapter } from './html-light.adapter';
import { HtmlHeavyAdapter } from './html-heavy.adapter';
import { StealthAdapter } from './stealth.adapter';

export interface VinAdapter {
  type: SourceType;
  extract(vin: string, source: DiscoveredSource): Promise<ExtractedVehicle | null>;
}

@Injectable()
export class AdapterRegistry {
  private readonly logger = new Logger(AdapterRegistry.name);
  private adapters = new Map<SourceType, VinAdapter>();

  constructor(
    private readonly json: JsonAdapter,
    private readonly htmlLight: HtmlLightAdapter,
    private readonly htmlHeavy: HtmlHeavyAdapter,
    private readonly stealthAdapter: StealthAdapter,
  ) {
    this.register('json', json);
    this.register('html_light', htmlLight);
    this.register('html_heavy', htmlHeavy);
    this.register('stealth', stealthAdapter);

    this.logger.log(`AdapterRegistry: ${this.adapters.size} adapters (Puppeteer Stealth for Cloudflare bypass)`);
  }

  private register(type: SourceType, adapter: VinAdapter): void {
    this.adapters.set(type, adapter);
  }

  get(type: SourceType): VinAdapter | undefined {
    return this.adapters.get(type);
  }

  getAll(): VinAdapter[] {
    return Array.from(this.adapters.values());
  }

  getTypes(): SourceType[] {
    return Array.from(this.adapters.keys());
  }
}
