/**
 * Source Service
 * 
 * Управління джерелами з lifecycle та auto-optimization
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MeshSource, MeshSourceDocument } from './source.schema';

// Default sources configuration
const DEFAULT_SOURCES: Partial<MeshSource>[] = [
  // ===== OFFICIAL API (HIGHEST TRUST) =====
  {
    name: 'nhtsa_official',
    domain: 'vpic.nhtsa.dot.gov',
    displayName: 'NHTSA Official',
    parserKind: 'nhtsa',
    type: 'aggregator',
    priority: 1,
    trustScore: 0.95,
    requestConfig: {
      searchUrl: 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{vin}?format=json',
      timeout: 10000,
      rateLimit: 500,
    },
    selectorConfig: {},
    status: 'active',
    description: 'Official NHTSA VIN Decoder API - Make, Model, Year, Specs',
    sampleVins: ['5YJSA1DN2CFP09123', '1G1JC524717100001', 'WBA3A5C51CF256789'],
  },
  
  // ===== AGGREGATORS (HIGH PRIORITY) =====
  {
    name: 'statvin',
    domain: 'stat.vin',
    displayName: 'Stat.VIN',
    parserKind: 'html',
    type: 'aggregator',
    priority: 5,
    trustScore: 0.85,
    requestConfig: {
      // StatVin - URL follows redirect automatically
      searchUrl: 'https://stat.vin/cars/{vin}',
      timeout: 15000,
      rateLimit: 2500,
    },
    selectorConfig: {
      // Витягуємо з meta tags та title - найнадійніші селектори
      vin: 'link[rel="canonical"]',
      title: 'meta[property="og:title"], title',
      price: '.auction-price-value, .price-block .value',
      saleDate: '.sale-date-value',
      lotNumber: '.lot-number-value',
      mileage: '.odometer-value',
      damage: '.damage-type-value',
      location: '.location-value',
      images: '.gallery img, meta[property="og:image"]',
    },
    status: 'active',
    description: 'VIN статистика та історія аукціонів',
    sampleVins: ['5YJSA1DN2CFP09123', '1G1JC524717100001'],
  },
  {
    name: 'bidfax',
    domain: 'bidfax.info',
    displayName: 'BidFax',
    parserKind: 'html',
    type: 'aggregator',
    priority: 6,
    trustScore: 0.80,
    requestConfig: {
      searchUrl: 'https://bidfax.info/{vin}',
      timeout: 15000,
      rateLimit: 2000,
      needsProxy: true, // CloudFlare blocked
    },
    selectorConfig: {
      vin: '.vin-number, .vehicle-vin',
      title: '.vehicle-title, h1',
      price: '.price, .final-bid',
      saleDate: '.sale-date',
      lotNumber: '.lot-number',
      images: '.gallery img, .vehicle-images img',
      damage: '.damage, .primary-damage',
    },
    status: 'disabled', // CloudFlare protected - needs proxy
    description: 'Агрегатор аукціонних даних (CloudFlare blocked)',
  },
  {
    name: 'poctra',
    domain: 'poctra.com',
    displayName: 'Poctra',
    parserKind: 'html',
    type: 'aggregator',
    priority: 7,
    trustScore: 0.75,
    requestConfig: {
      searchUrl: 'https://poctra.com/vin/{vin}',
      timeout: 15000,
      rateLimit: 2000,
      needsProxy: true, // CloudFlare blocked
    },
    selectorConfig: {
      vin: '.vin, [data-vin]',
      title: '.title, h1',
      price: '.price, .bid-amount',
      images: '.carousel img, .photos img',
      lotNumber: '.lot',
      saleDate: '.date',
    },
    status: 'disabled', // CloudFlare protected - needs proxy
    description: 'Історія аукціонів (CloudFlare blocked)',
  },
  
  // ===== COMPETITORS =====
  {
    name: 'autobidmaster',
    domain: 'autobidmaster.com',
    displayName: 'AutoBidMaster',
    parserKind: 'search_form',
    type: 'competitor',
    priority: 15,
    trustScore: 0.70,
    requestConfig: {
      searchUrl: 'https://www.autobidmaster.com/en/carfinder/lot/?q={vin}',
      timeout: 15000,
      rateLimit: 3000,
      needsProxy: true,
    },
    selectorConfig: {
      vin: '.lot-info__vin',
      title: '.lot-info__title',
      price: '.lot-info__price',
      lotNumber: '.lot-info__lot',
      images: '.lot-gallery__image img',
      resultContainer: '.search-result-card',
    },
    status: 'disabled', // Anti-bot blocked
    description: 'Конкурентний сервіс автоаукціонів (needs proxy)',
  },
  {
    name: 'salvagebid',
    domain: 'salvagebid.com',
    displayName: 'SalvageBid',
    parserKind: 'search_form',
    type: 'competitor',
    priority: 16,
    trustScore: 0.70,
    requestConfig: {
      searchUrl: 'https://salvagebid.com/search?query={vin}',
      timeout: 15000,
      rateLimit: 3000,
    },
    selectorConfig: {
      vin: '[data-vin]',
      title: '.vehicle-card__title, .lot-title',
      price: '.vehicle-card__price, .lot-price',
      images: '.vehicle-card__image img',
      resultContainer: '.vehicle-card, .search-item',
    },
    status: 'active',
    description: 'Конкурентний сервіс',
  },
  
  // ===== AUCTION SOURCES =====
  {
    name: 'iaai_public',
    domain: 'iaai.com',
    displayName: 'IAAI (Public)',
    parserKind: 'search_form',
    type: 'auction',
    priority: 3,
    trustScore: 0.95,
    requestConfig: {
      searchUrl: 'https://www.iaai.com/Search?Keyword={vin}',
      timeout: 20000,
      rateLimit: 5000,
    },
    selectorConfig: {
      // IAAI HTML structure селектори
      vin: '.vehicle-details__vin, .table-striped td:contains("VIN") + td',
      title: '.vehicle-details__title, .product-title h1',
      price: '.bid-amount, .current-bid-value',
      saleDate: '.auction-date, .sale-info-date',
      lotNumber: '.stock-number, .lot-id',
      images: '.vehicle-image img, .gallery-image img',
      damage: '.damage-description, .primary-damage-text',
      location: '.yard-name, .branch-name',
      resultContainer: '.search-result, .vehicle-item',
    },
    status: 'active',
    description: 'Insurance Auto Auctions публічні лістинги',
    sampleVins: ['5YJSA1DN2CFP09123', '1G1JC524717100001'],
  },
  {
    name: 'copart_public',
    domain: 'copart.com',
    displayName: 'Copart (Public)',
    parserKind: 'search_form',
    type: 'auction',
    priority: 3,
    trustScore: 0.95,
    requestConfig: {
      searchUrl: 'https://www.copart.com/lotSearchResults/?free=true&query={vin}',
      timeout: 20000,
      rateLimit: 5000,
      needsProxy: true, // Anti-bot блокує
    },
    selectorConfig: {
      vin: '.lot-vin',
      title: '.lot-title, .lot-header__title',
      price: '.bid-price, .current-bid',
      saleDate: '.sale-date',
      lotNumber: '.lot-number',
      images: '.lot-image img',
      damage: '.primary-damage',
      location: '.location',
    },
    status: 'disabled', // Anti-bot - потребує proxy
    description: 'Copart публічні лістинги (anti-bot blocked)',
  },
  
  // ===== ADDITIONAL AGGREGATORS =====
  {
    name: 'vindecoderz',
    domain: 'vindecoderz.com',
    displayName: 'VINDecoderz',
    parserKind: 'html',
    type: 'aggregator',
    priority: 10,
    trustScore: 0.70,
    requestConfig: {
      searchUrl: 'https://www.vindecoderz.com/EN/check-lookup/{vin}',
      timeout: 15000,
      rateLimit: 3000,
    },
    selectorConfig: {
      vin: 'h1',
      title: 'h1, .vehicle-info h2',
      price: '.price-value',
      mileage: '.mileage-value',
      images: '.vehicle-images img',
    },
    status: 'testing',
    description: 'VIN Decoder та перевірка',
    sampleVins: ['5YJSA1DN2CFP09123'],
  },
  {
    name: 'faxvin',
    domain: 'faxvin.com',
    displayName: 'FaxVIN',
    parserKind: 'html',
    type: 'aggregator',
    priority: 11,
    trustScore: 0.65,
    requestConfig: {
      searchUrl: 'https://www.faxvin.com/vin-decoder/result?vin={vin}',
      timeout: 15000,
      rateLimit: 3000,
    },
    selectorConfig: {
      vin: '.vin-number, .vehicle-vin',
      title: '.vehicle-title, h1',
      price: '.price',
      images: '.photo-gallery img',
    },
    status: 'testing',
    description: 'VIN перевірка та декодер',
    sampleVins: ['5YJSA1DN2CFP09123'],
  },
  
  // ===== FALLBACK =====
  {
    name: 'google_fallback',
    domain: 'duckduckgo.com',
    displayName: 'DuckDuckGo Search',
    parserKind: 'google',
    type: 'fallback',
    priority: 50,
    trustScore: 0.50,
    requestConfig: {
      // DuckDuckGo HTML версія - без JS
      searchUrl: 'https://html.duckduckgo.com/html/?q={vin}+auction+copart+iaai',
      timeout: 10000,
      rateLimit: 5000,
    },
    selectorConfig: {
      resultContainer: '.result',
      titleSelector: '.result__title a',
      urlSelector: '.result__url',
    },
    status: 'active',
    description: 'Пошук згадок VIN через DuckDuckGo',
  },
];

@Injectable()
export class SourceService implements OnModuleInit {
  private readonly logger = new Logger(SourceService.name);

  constructor(
    @InjectModel(MeshSource.name)
    private readonly model: Model<MeshSourceDocument>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultSources();
  }

  private async seedDefaultSources() {
    for (const source of DEFAULT_SOURCES) {
      const exists = await this.model.findOne({ name: source.name });
      if (!exists) {
        await this.model.create(source);
        this.logger.log(`Seeded mesh source: ${source.name}`);
      }
    }
    this.logger.log(`Mesh sources initialized: ${DEFAULT_SOURCES.length} defaults`);
  }

  // ========== CRUD ==========

  async getAll(): Promise<MeshSource[]> {
    return this.model.find().sort({ priority: 1, trustScore: -1 }).lean();
  }

  async getActiveSources(): Promise<MeshSource[]> {
    return this.model.find({
      enabled: true,
      status: { $in: ['active', 'degraded'] },
      quarantine: false,
      $or: [
        { cooldownUntil: null },
        { cooldownUntil: { $lt: new Date() } },
      ],
    }).sort({ priority: 1, trustScore: -1 }).lean();
  }

  async getByName(name: string): Promise<MeshSourceDocument | null> {
    return this.model.findOne({ name });
  }

  async getByDomain(domain: string): Promise<MeshSourceDocument | null> {
    return this.model.findOne({ domain });
  }

  async getByParserKind(kind: string): Promise<MeshSource[]> {
    return this.model.find({ 
      parserKind: kind,
      enabled: true,
      quarantine: false,
    }).sort({ priority: 1 }).lean();
  }

  async create(data: Partial<MeshSource>): Promise<MeshSourceDocument> {
    return this.model.create(data);
  }

  async update(name: string, data: Partial<MeshSource>): Promise<MeshSourceDocument | null> {
    return this.model.findOneAndUpdate({ name }, data, { new: true });
  }

  // ========== LIFECYCLE ==========

  async activate(name: string): Promise<void> {
    await this.model.updateOne({ name }, {
      status: 'active',
      enabled: true,
      quarantine: false,
      quarantineReason: null,
      consecutiveFailures: 0,
    });
    this.logger.log(`Source ${name} activated`);
  }

  async degrade(name: string, reason?: string): Promise<void> {
    await this.model.updateOne({ name }, {
      status: 'degraded',
      quarantineReason: reason,
    });
    this.logger.warn(`Source ${name} degraded: ${reason}`);
  }

  async disable(name: string, reason?: string): Promise<void> {
    await this.model.updateOne({ name }, {
      status: 'disabled',
      enabled: false,
      quarantineReason: reason,
    });
    this.logger.warn(`Source ${name} disabled: ${reason}`);
  }

  async quarantineSource(name: string, reason: string): Promise<void> {
    await this.model.updateOne({ name }, {
      status: 'quarantined',
      quarantine: true,
      quarantineReason: reason,
      enabled: false,
    });
    this.logger.error(`Source ${name} quarantined: ${reason}`);
  }

  async setCooldown(name: string, minutes: number): Promise<void> {
    const cooldownUntil = new Date(Date.now() + minutes * 60 * 1000);
    await this.model.updateOne({ name }, { cooldownUntil });
    this.logger.log(`Source ${name} cooldown until ${cooldownUntil.toISOString()}`);
  }

  // ========== STATS ==========

  async recordSuccess(name: string, latency: number, hasExactMatch: boolean): Promise<void> {
    const source = await this.getByName(name);
    if (!source) return;

    const totalSearches = (source.totalSearches || 0) + 1;
    const successfulSearches = (source.successfulSearches || 0) + 1;
    const exactMatchCount = (source.exactMatchCount || 0) + (hasExactMatch ? 1 : 0);
    const vinHitRate = exactMatchCount / totalSearches;
    
    const avgLatency = source.avgLatency > 0
      ? Math.round((source.avgLatency + latency) / 2)
      : latency;

    await this.model.updateOne({ name }, {
      $inc: {
        totalSearches: 1,
        successfulSearches: 1,
        consecutiveSuccesses: 1,
        ...(hasExactMatch ? { exactMatchCount: 1 } : {}),
      },
      $set: {
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
        avgLatency,
        vinHitRate: Number(vinHitRate.toFixed(3)),
      },
    });

    // Auto-activate if testing and performing well
    if (source.status === 'testing' && source.consecutiveSuccesses >= 2) {
      await this.activate(name);
    }

    // Auto-recover degraded source
    if (source.status === 'degraded' && source.consecutiveSuccesses >= 3) {
      await this.activate(name);
    }
  }

  async recordFailure(name: string): Promise<void> {
    const source = await this.getByName(name);
    if (!source) return;

    await this.model.updateOne({ name }, {
      $inc: {
        totalSearches: 1,
        failedSearches: 1,
        consecutiveFailures: 1,
      },
      $set: {
        consecutiveSuccesses: 0,
        lastFailureAt: new Date(),
      },
    });

    // Auto-degrade after 3 consecutive failures
    if ((source.consecutiveFailures || 0) >= 2 && source.status === 'active') {
      await this.degrade(name, 'Consecutive failures');
    }

    // Auto-disable after 5 consecutive failures
    if ((source.consecutiveFailures || 0) >= 4) {
      await this.disable(name, 'Too many consecutive failures');
    }
  }

  async recordEmpty(name: string, latency: number): Promise<void> {
    await this.model.updateOne({ name }, {
      $inc: {
        totalSearches: 1,
        emptySearches: 1,
      },
      $set: {
        lastSuccessAt: new Date(), // technically not a failure
      },
    });
  }

  // ========== METRICS ==========

  async getStats(): Promise<{
    total: number;
    active: number;
    degraded: number;
    disabled: number;
    quarantined: number;
    byType: Record<string, number>;
    byKind: Record<string, number>;
    avgHitRate: number;
  }> {
    const all = await this.model.find().lean();
    
    const byStatus = all.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byType = all.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byKind = all.reduce((acc, s) => {
      acc[s.parserKind] = (acc[s.parserKind] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const activeWithHitRate = all.filter(s => s.status === 'active' && s.vinHitRate > 0);
    const avgHitRate = activeWithHitRate.length > 0
      ? activeWithHitRate.reduce((sum, s) => sum + s.vinHitRate, 0) / activeWithHitRate.length
      : 0;

    return {
      total: all.length,
      active: byStatus.active || 0,
      degraded: byStatus.degraded || 0,
      disabled: byStatus.disabled || 0,
      quarantined: byStatus.quarantined || 0,
      byType,
      byKind,
      avgHitRate: Number(avgHitRate.toFixed(3)),
    };
  }
}
