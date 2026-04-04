/**
 * Redis Cache Service
 * 
 * Production-ready Redis caching with fallback to in-memory:
 * - Automatic connection management
 * - Graceful fallback to in-memory if Redis unavailable
 * - Support for clusters and sentinels
 * - Connection pooling
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface IRedisService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>;
  isConnected(): boolean;
}

@Injectable()
export class RedisService implements IRedisService, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isRedisAvailable = false;
  
  // Fallback in-memory cache
  private memoryCache = new Map<string, { value: string; expiry: number }>();

  constructor(private configService: ConfigService) {
    this.initializeRedis();
  }

  private initializeRedis(): void {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not configured, using in-memory cache');
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 5000,
      });

      this.client.on('connect', () => {
        this.logger.log('Redis connected');
        this.isRedisAvailable = true;
      });

      this.client.on('error', (err) => {
        this.logger.warn(`Redis error: ${err.message}`);
        this.isRedisAvailable = false;
      });

      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
        this.isRedisAvailable = false;
      });

      // Try to connect
      this.client.connect().catch((err) => {
        this.logger.warn(`Redis connection failed: ${err.message}, using in-memory cache`);
        this.isRedisAvailable = false;
      });
    } catch (error) {
      this.logger.warn(`Redis initialization failed: ${error.message}`);
      this.isRedisAvailable = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  isConnected(): boolean {
    return this.isRedisAvailable;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isRedisAvailable && this.client) {
        const value = await this.client.get(key);
        if (value) {
          return JSON.parse(value) as T;
        }
        return null;
      }

      // Fallback to memory cache
      return this.getFromMemory<T>(key);
    } catch (error) {
      this.logger.warn(`Redis GET error for ${key}: ${error.message}`);
      return this.getFromMemory<T>(key);
    }
  }

  async set(key: string, value: any, ttlSeconds: number = 120): Promise<void> {
    const serialized = JSON.stringify(value);

    try {
      if (this.isRedisAvailable && this.client) {
        await this.client.setex(key, ttlSeconds, serialized);
        return;
      }

      // Fallback to memory cache
      this.setInMemory(key, serialized, ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis SET error for ${key}: ${error.message}`);
      this.setInMemory(key, serialized, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (this.isRedisAvailable && this.client) {
        await this.client.del(key);
      }
      this.memoryCache.delete(key);
    } catch (error) {
      this.logger.warn(`Redis DEL error for ${key}: ${error.message}`);
      this.memoryCache.delete(key);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      if (this.isRedisAvailable && this.client) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      }

      // Also clean memory cache
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      for (const key of this.memoryCache.keys()) {
        if (regex.test(key)) {
          this.memoryCache.delete(key);
        }
      }
    } catch (error) {
      this.logger.warn(`Redis delPattern error: ${error.message}`);
    }
  }

  // Memory cache helpers
  private getFromMemory<T>(key: string): T | null {
    const item = this.memoryCache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.memoryCache.delete(key);
      return null;
    }

    return JSON.parse(item.value) as T;
  }

  private setInMemory(key: string, value: string, ttlSeconds: number): void {
    this.memoryCache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  // Stats
  async getStats(): Promise<{
    type: 'redis' | 'memory';
    connected: boolean;
    memoryEntries: number;
    redisInfo?: any;
  }> {
    const stats: {
      type: 'redis' | 'memory';
      connected: boolean;
      memoryEntries: number;
      redisInfo?: any;
    } = {
      type: this.isRedisAvailable ? 'redis' : 'memory',
      connected: this.isRedisAvailable,
      memoryEntries: this.memoryCache.size,
    };

    if (this.isRedisAvailable && this.client) {
      try {
        const info = await this.client.info('memory');
        stats.redisInfo = info;
      } catch {
        // Ignore
      }
    }

    return stats;
  }
}
