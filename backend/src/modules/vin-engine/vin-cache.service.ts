/**
 * VIN Cache Service
 * 
 * Caches VIN search results to avoid repeated searches
 * Uses MongoDB as cache store
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { MergedVinData } from './vin-merge.service';

// Cache TTL in milliseconds (7 days)
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

@Schema({ timestamps: true })
export class VinCache {
  @Prop({ required: true, index: true, unique: true })
  vin: string;

  @Prop({ type: Object })
  data: MergedVinData;

  @Prop({ default: false })
  notFound: boolean;

  @Prop()
  expiresAt: Date;

  @Prop({ default: 0 })
  hitCount: number;

  @Prop()
  lastAccessedAt: Date;

  @Prop()
  createdAt: Date;
}

export const VinCacheSchema = SchemaFactory.createForClass(VinCache);

// Index for TTL
VinCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Injectable()
export class VinCacheService {
  private readonly logger = new Logger(VinCacheService.name);

  constructor(
    @InjectModel(VinCache.name)
    private cacheModel: Model<VinCache>,
  ) {}

  /**
   * Get cached VIN data
   */
  async get(vin: string): Promise<MergedVinData | null | 'not_found'> {
    const normalized = vin.toUpperCase().trim();
    
    const cached = await this.cacheModel.findOne({
      vin: normalized,
      expiresAt: { $gt: new Date() },
    });

    if (!cached) {
      return null;
    }

    // Update hit count
    await this.cacheModel.updateOne(
      { vin: normalized },
      { 
        $inc: { hitCount: 1 },
        $set: { lastAccessedAt: new Date() }
      }
    );

    if (cached.notFound) {
      return 'not_found';
    }

    this.logger.debug(`Cache HIT for VIN ${vin}`);
    return cached.data;
  }

  /**
   * Set cached VIN data
   */
  async set(vin: string, data: MergedVinData | null): Promise<void> {
    const normalized = vin.toUpperCase().trim();
    const expiresAt = new Date(Date.now() + CACHE_TTL);

    await this.cacheModel.findOneAndUpdate(
      { vin: normalized },
      {
        vin: normalized,
        data: data,
        notFound: data === null,
        expiresAt,
        lastAccessedAt: new Date(),
        hitCount: 0,
      },
      { upsert: true, new: true }
    );

    this.logger.debug(`Cache SET for VIN ${vin} (expires: ${expiresAt})`);
  }

  /**
   * Delete cached VIN data
   */
  async delete(vin: string): Promise<void> {
    const normalized = vin.toUpperCase().trim();
    await this.cacheModel.deleteOne({ vin: normalized });
    this.logger.debug(`Cache DELETE for VIN ${vin}`);
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{
    totalCached: number;
    notFoundCount: number;
    avgHitCount: number;
    expiringSoon: number;
  }> {
    const [stats] = await this.cacheModel.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          notFound: [{ $match: { notFound: true } }, { $count: 'count' }],
          avgHits: [{ $group: { _id: null, avg: { $avg: '$hitCount' } } }],
          expiring: [
            { 
              $match: { 
                expiresAt: { 
                  $lt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                  $gt: new Date()
                } 
              } 
            },
            { $count: 'count' }
          ],
        },
      },
    ]);

    return {
      totalCached: stats.total[0]?.count || 0,
      notFoundCount: stats.notFound[0]?.count || 0,
      avgHitCount: Math.round((stats.avgHits[0]?.avg || 0) * 10) / 10,
      expiringSoon: stats.expiring[0]?.count || 0,
    };
  }

  /**
   * Clear expired cache
   */
  async clearExpired(): Promise<number> {
    const result = await this.cacheModel.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    this.logger.log(`Cleared ${result.deletedCount} expired cache entries`);
    return result.deletedCount;
  }
}
