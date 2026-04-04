/**
 * Adapter Registry
 * 
 * Реєстр всіх адаптерів для dynamic dispatch
 */

import { Injectable, Logger } from '@nestjs/common';
import { VinSourceAdapter, SourceConfig } from './interfaces/vin-source-adapter.interface';
import { HtmlDetailAdapter } from './html/html-detail.adapter';
import { SearchFormAdapter } from './search-form/search-form.adapter';
import { GoogleMentionAdapter } from './google/google-mention.adapter';
import { JsonApiAdapter } from './json/json-api.adapter';
import { NhtsaAdapter } from './nhtsa/nhtsa.adapter';

@Injectable()
export class AdapterRegistry {
  private readonly logger = new Logger(AdapterRegistry.name);
  private readonly adapters = new Map<string, VinSourceAdapter>();

  constructor(
    private readonly htmlAdapter: HtmlDetailAdapter,
    private readonly searchFormAdapter: SearchFormAdapter,
    private readonly googleAdapter: GoogleMentionAdapter,
    private readonly jsonAdapter: JsonApiAdapter,
    private readonly nhtsaAdapter: NhtsaAdapter,
  ) {
    this.register(htmlAdapter);
    this.register(searchFormAdapter);
    this.register(googleAdapter);
    this.register(jsonAdapter);
    this.register(nhtsaAdapter);
    
    this.logger.log(`Adapter Registry initialized with ${this.adapters.size} adapters`);
  }

  private register(adapter: VinSourceAdapter): void {
    this.adapters.set(adapter.kind, adapter);
    this.logger.debug(`Registered adapter: ${adapter.kind} (${adapter.displayName})`);
  }

  /**
   * Get adapter by kind
   */
  get(kind: string): VinSourceAdapter | undefined {
    return this.adapters.get(kind);
  }

  /**
   * Get adapter that can handle this source
   */
  getForSource(source: SourceConfig): VinSourceAdapter | undefined {
    const adapter = this.adapters.get(source.parserKind);
    if (adapter && adapter.canHandle(source)) {
      return adapter;
    }
    return undefined;
  }

  /**
   * Get all registered adapters
   */
  getAll(): VinSourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get all adapter kinds
   */
  getKinds(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if adapter exists for kind
   */
  has(kind: string): boolean {
    return this.adapters.has(kind);
  }
}
