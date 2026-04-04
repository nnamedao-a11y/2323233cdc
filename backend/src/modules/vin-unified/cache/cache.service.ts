/**
 * VIN Cache Service
 * 
 * TTL by status:
 * - AUCTION_ACTIVE: 5-10 min (prices change)
 * - SOLD: 24h (stable data)
 * - NOT_FOUND: 1h (retry later)
 * - FOUND: 2h (no auction, stable)
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VinCache } from './vin-cache.schema';
import { VinResolveResponseDto, VehicleStatus } from '../dto/vin.dto';

// TTL in seconds
const TTL_MAP: Record<VehicleStatus, number> = {
  'AUCTION_ACTIVE': 5 * 60,      // 5 min
  'SOLD': 24 * 60 * 60,          // 24h
  'NOT_FOUND': 60 * 60,          // 1h
  'FOUND': 2 * 60 * 60,          // 2h
  'PARTIAL': 30 * 60,            // 30 min
  'ARCHIVED': 7 * 24 * 60 * 60,  // 7 days
};

@Injectable()
export class VinCacheService {
  private readonly logger = new Logger(VinCacheService.name);
  
  // In-memory cache for fast access
  private memCache = new Map<string, { data: VinResolveResponseDto; expiresAt: number }>();

  constructor(
    @InjectModel(VinCache.name) private cacheModel: Model<VinCache>,
  ) {}

  /**
   * Get cached result
   */
  async get(vin: string): Promise<VinResolveResponseDto | null> {
    const cleanVin = vin.toUpperCase();

    // Check memory cache first
    const memCached = this.memCache.get(cleanVin);
    if (memCached && memCached.expiresAt > Date.now()) {
      this.logger.debug(`[Cache] Memory hit: ${cleanVin}`);
      return memCached.data;
    }

    // Check MongoDB
    const cached = await this.cacheModel.findOne({
      vin: cleanVin,
      expiresAt: { $gt: new Date() },
    });

    if (cached) {
      // Restore to memory
      const ttlMs = cached.expiresAt.getTime() - Date.now();
      this.memCache.set(cleanVin, {
        data: cached.data as unknown as VinResolveResponseDto,
        expiresAt: Date.now() + ttlMs,
      });

      this.logger.debug(`[Cache] MongoDB hit: ${cleanVin}`);
      return cached.data as unknown as VinResolveResponseDto;
    }

    return null;
  }

  /**
   * Set cache with TTL based on status
   */
  async set(vin: string, data: VinResolveResponseDto, status?: VehicleStatus): Promise<void> {
    const cleanVin = vin.toUpperCase();
    const effectiveStatus = status || data.status;
    const ttlSeconds = TTL_MAP[effectiveStatus] || TTL_MAP['FOUND'];
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Save to memory
    this.memCache.set(cleanVin, {
      data,
      expiresAt: expiresAt.getTime(),
    });

    // Save to MongoDB
    await this.cacheModel.updateOne(
      { vin: cleanVin },
      {
        vin: cleanVin,
        data,
        status: effectiveStatus,
        expiresAt,
        updatedAt: new Date(),
      },
      { upsert: true },
    );

    this.logger.debug(`[Cache] Set: ${cleanVin} | status=${effectiveStatus} | TTL=${ttlSeconds}s`);
  }

  /**
   * Delete cache entry
   */
  async delete(vin: string): Promise<void> {
    const cleanVin = vin.toUpperCase();
    
    this.memCache.delete(cleanVin);
    await this.cacheModel.deleteOne({ vin: cleanVin });
    
    this.logger.debug(`[Cache] Deleted: ${cleanVin}`);
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<number> {
    // Clear memory cache
    const now = Date.now();
    for (const [vin, entry] of this.memCache.entries()) {
      if (entry.expiresAt <= now) {
        this.memCache.delete(vin);
      }
    }

    // Clear MongoDB
    const result = await this.cacheModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    return result.deletedCount;
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{
    memorySize: number;
    mongoSize: number;
    byStatus: Record<string, number>;
  }> {
    const mongoCount = await this.cacheModel.countDocuments();
    
    const byStatus = await this.cacheModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return {
      memorySize: this.memCache.size,
      mongoSize: mongoCount,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
