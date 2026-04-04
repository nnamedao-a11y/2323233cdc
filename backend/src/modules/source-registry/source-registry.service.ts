/**
 * Source Registry Service - Extended
 * 
 * Керування джерелами VIN пошуку з auto-optimization підтримкою
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Source, SourceDocument } from './source.schema';

// Default sources to seed
const DEFAULT_SOURCES = [
  {
    name: 'local_db',
    displayName: 'Локальна база',
    type: 'database',
    manualWeight: 1.0,
    systemScore: 1.0,
    effectiveWeight: 1.0,
    priority: 1,
    description: 'Пошук у власній базі vehicles',
  },
  {
    name: 'bidfax',
    displayName: 'BidFax',
    type: 'aggregator',
    manualWeight: 0.80,
    systemScore: 1.0,
    effectiveWeight: 0.80,
    priority: 10,
    baseUrl: 'https://bidfax.info',
    description: 'Агрегатор аукціонних даних',
  },
  {
    name: 'poctra',
    displayName: 'Poctra',
    type: 'aggregator',
    manualWeight: 0.75,
    systemScore: 1.0,
    effectiveWeight: 0.75,
    priority: 11,
    baseUrl: 'https://poctra.com',
    description: 'Історія аукціонів',
  },
  {
    name: 'stat_vin',
    displayName: 'Stat.VIN',
    type: 'aggregator',
    manualWeight: 0.80,
    systemScore: 1.0,
    effectiveWeight: 0.80,
    priority: 12,
    baseUrl: 'https://stat.vin',
    description: 'VIN статистика',
  },
  {
    name: 'autobidmaster',
    displayName: 'AutoBidMaster',
    type: 'competitor',
    manualWeight: 0.70,
    systemScore: 1.0,
    effectiveWeight: 0.70,
    priority: 20,
    baseUrl: 'https://autobidmaster.com',
    description: 'Конкурентний сервіс',
  },
  {
    name: 'salvagebid',
    displayName: 'SalvageBid',
    type: 'competitor',
    manualWeight: 0.70,
    systemScore: 1.0,
    effectiveWeight: 0.70,
    priority: 21,
    baseUrl: 'https://salvagebid.com',
    description: 'Конкурентний сервіс',
  },
  {
    name: 'web_search',
    displayName: 'Web Search',
    type: 'web_search',
    manualWeight: 0.55,
    systemScore: 1.0,
    effectiveWeight: 0.55,
    priority: 50,
    description: 'Пошук через DuckDuckGo',
  },
];

@Injectable()
export class SourceRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SourceRegistryService.name);

  constructor(
    @InjectModel(Source.name)
    private sourceModel: Model<SourceDocument>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultSources();
  }

  private async seedDefaultSources() {
    for (const source of DEFAULT_SOURCES) {
      const exists = await this.sourceModel.findOne({ name: source.name });
      if (!exists) {
        await this.sourceModel.create(source);
        this.logger.log(`Seeded source: ${source.name}`);
      }
    }
  }

  async getAll(): Promise<Source[]> {
    return this.sourceModel.find().sort({ priority: 1 }).lean();
  }

  async getEnabledSources(): Promise<Source[]> {
    return this.sourceModel.find({
      enabled: true,
      autoDisabled: { $ne: true },
    }).sort({ effectiveWeight: -1, priority: 1 }).lean();
  }

  async findByName(name: string): Promise<SourceDocument | null> {
    return this.sourceModel.findOne({ name });
  }

  async createIfMissing(name: string, displayName?: string): Promise<SourceDocument> {
    return this.sourceModel.findOneAndUpdate(
      { name },
      {
        $setOnInsert: {
          name,
          displayName: displayName || name,
          enabled: true,
          manualWeight: 0.5,
          systemScore: 1,
          effectiveWeight: 0.5,
        },
      },
      { upsert: true, new: true },
    );
  }

  async updateManualWeight(name: string, manualWeight: number): Promise<void> {
    const safeWeight = Math.max(0, Math.min(1, manualWeight));
    const source = await this.findByName(name);
    if (!source) return;

    const effectiveWeight = Number((safeWeight * (source.systemScore || 1)).toFixed(3));

    await this.sourceModel.updateOne({ name }, { 
      manualWeight: safeWeight,
      effectiveWeight,
    });
    this.logger.log(`Updated manual weight for ${name}: ${safeWeight}, effective: ${effectiveWeight}`);
  }

  async toggle(name: string, enabled: boolean): Promise<void> {
    await this.sourceModel.updateOne({ name }, { enabled });
    this.logger.log(`Toggled ${name}: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Record successful search with results
   */
  async recordSuccess(
    name: string,
    responseTime: number,
    meta?: {
      resultCount?: number;
      exactMatch?: boolean;
    },
  ): Promise<void> {
    const source = await this.createIfMissing(name);

    const totalSearches = (source.totalSearches || 0) + 1;
    const exactMatchCount = (source.exactMatchCount || 0) + (meta?.exactMatch ? 1 : 0);
    const vinHitRate = totalSearches > 0 ? exactMatchCount / totalSearches : 0;

    const newAvg = source.avgResponseTime > 0
      ? Math.round((source.avgResponseTime + responseTime) / 2)
      : responseTime;

    await this.sourceModel.updateOne(
      { name },
      {
        $inc: {
          successCount: 1,
          totalSearches: 1,
          ...(meta?.exactMatch ? { exactMatchCount: 1 } : {}),
        },
        $set: {
          lastSuccessAt: new Date(),
          avgResponseTime: newAvg,
          consecutiveFailCount: 0,
          lastUsedAt: new Date(),
          lastResultCount: meta?.resultCount ?? 0,
          lastExactMatch: !!meta?.exactMatch,
          vinHitRate: Number(vinHitRate.toFixed(3)),
        },
      },
    );
  }

  /**
   * Record search that returned empty results
   */
  async recordEmpty(name: string, responseTime: number): Promise<void> {
    const source = await this.createIfMissing(name);

    const totalSearches = (source.totalSearches || 0) + 1;
    const vinHitRate = totalSearches > 0 ? (source.exactMatchCount || 0) / totalSearches : 0;

    const newAvg = source.avgResponseTime > 0
      ? Math.round((source.avgResponseTime + responseTime) / 2)
      : responseTime;

    await this.sourceModel.updateOne(
      { name },
      {
        $inc: {
          totalSearches: 1,
          emptyResultCount: 1,
        },
        $set: {
          avgResponseTime: newAvg,
          lastUsedAt: new Date(),
          lastResultCount: 0,
          lastExactMatch: false,
          vinHitRate: Number(vinHitRate.toFixed(3)),
        },
      },
    );
  }

  /**
   * Record search that returned invalid/non-matching results
   */
  async recordInvalid(name: string, responseTime: number): Promise<void> {
    const source = await this.createIfMissing(name);

    const totalSearches = (source.totalSearches || 0) + 1;
    const vinHitRate = totalSearches > 0 ? (source.exactMatchCount || 0) / totalSearches : 0;

    const newAvg = source.avgResponseTime > 0
      ? Math.round((source.avgResponseTime + responseTime) / 2)
      : responseTime;

    await this.sourceModel.updateOne(
      { name },
      {
        $inc: {
          totalSearches: 1,
          invalidResultCount: 1,
        },
        $set: {
          avgResponseTime: newAvg,
          lastUsedAt: new Date(),
          lastExactMatch: false,
          vinHitRate: Number(vinHitRate.toFixed(3)),
        },
      },
    );
  }

  /**
   * Record failed search (error/timeout)
   */
  async recordFail(name: string): Promise<void> {
    await this.createIfMissing(name);

    await this.sourceModel.updateOne(
      { name },
      {
        $inc: {
          failCount: 1,
          totalSearches: 1,
          consecutiveFailCount: 1,
        },
        $set: {
          lastFailAt: new Date(),
          lastUsedAt: new Date(),
          lastExactMatch: false,
        },
      },
    );
  }

  /**
   * Set system score and recalculate effective weight
   */
  async setSystemScore(name: string, systemScore: number): Promise<void> {
    const source = await this.findByName(name);
    if (!source) return;

    const safeScore = Math.max(0.1, Math.min(1, systemScore));
    const effectiveWeight = Number(
      Math.max(0, Math.min(1, (source.manualWeight || 0.7) * safeScore)).toFixed(3)
    );

    await this.sourceModel.updateOne(
      { name },
      {
        systemScore: safeScore,
        effectiveWeight,
      },
    );
  }

  /**
   * Auto-disable source due to poor performance
   */
  async autoDisable(name: string, reason: string): Promise<void> {
    await this.sourceModel.updateOne(
      { name },
      {
        autoDisabled: true,
        autoDisabledReason: reason,
      },
    );
    this.logger.warn(`Source ${name} auto-disabled: ${reason}`);
  }

  /**
   * Auto-enable source after recovery
   */
  async autoEnable(name: string): Promise<void> {
    await this.sourceModel.updateOne(
      { name },
      {
        autoDisabled: false,
        autoDisabledReason: null,
      },
    );
    this.logger.log(`Source ${name} auto-enabled`);
  }

  /**
   * Reset all stats for a source
   */
  async resetStats(name: string): Promise<void> {
    await this.sourceModel.updateOne(
      { name },
      {
        successCount: 0,
        failCount: 0,
        exactMatchCount: 0,
        emptyResultCount: 0,
        invalidResultCount: 0,
        totalSearches: 0,
        consecutiveFailCount: 0,
        avgResponseTime: 0,
        vinHitRate: 0,
        lastResultCount: 0,
        lastExactMatch: false,
        systemScore: 1,
        // Recalculate effective weight
        $expr: { $multiply: ['$manualWeight', 1] },
      },
    );

    // Fix effective weight after reset
    const source = await this.findByName(name);
    if (source) {
      await this.sourceModel.updateOne(
        { name },
        { effectiveWeight: source.manualWeight || 0.7 },
      );
    }

    this.logger.log(`Reset stats for ${name}`);
  }

  /**
   * Get stats summary
   */
  async getStats(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    autoDisabled: number;
    byType: Record<string, number>;
  }> {
    const all = await this.sourceModel.find().lean();
    const enabled = all.filter(s => s.enabled && !s.autoDisabled);
    const autoDisabled = all.filter(s => s.autoDisabled);
    const byType = all.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      autoDisabled: autoDisabled.length,
      byType,
    };
  }
}
