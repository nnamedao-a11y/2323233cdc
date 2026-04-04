/**
 * Redis Cache Module
 * 
 * Provides caching layer for frequently accessed data:
 * - Stats endpoints (leads, deals, KPI)
 * - Dashboard data
 * - User sessions
 */

import { Module, Global, DynamicModule, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

// In-memory cache fallback when Redis is not available
class InMemoryCache {
  private cache = new Map<string, { value: any; expiry: number }>();
  private readonly logger = new Logger('InMemoryCache');

  async get(key: string): Promise<any> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: any, ttlSeconds: number = 60): Promise<void> {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  async flushAll(): Promise<void> {
    this.cache.clear();
  }
}

// Cache Service Interface
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>;
  getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T>;
  wrap<T>(key: string, fn: () => Promise<T>, ttlSeconds?: number): Promise<T>;
}

export class CacheService implements ICacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly cache: InMemoryCache;
  private readonly defaultTTL: number;

  // Cache TTL presets (seconds)
  static readonly TTL = {
    SHORT: 30,           // 30 seconds - real-time data
    MEDIUM: 120,         // 2 minutes - stats
    LONG: 300,           // 5 minutes - analytics
    VERY_LONG: 900,      // 15 minutes - heavy computations
    HOUR: 3600,          // 1 hour - static data
  };

  // Cache key prefixes
  static readonly KEYS = {
    LEADS_STATS: 'stats:leads',
    DEALS_STATS: 'stats:deals',
    DEALS_PIPELINE: 'stats:deals:pipeline',
    KPI_DASHBOARD: 'stats:kpi:dashboard',
    KPI_TEAM: 'stats:kpi:team',
    KPI_MANAGER: 'stats:kpi:manager',
    STAFF_STATS: 'stats:staff',
    STAFF_PERFORMANCE: 'stats:staff:performance',
    STAFF_INACTIVE: 'stats:staff:inactive',
    CONTRACTS_ACCOUNTING: 'stats:contracts:accounting',
    INVOICES_ANALYTICS: 'stats:invoices:analytics',
    SHIPPING_ANALYTICS: 'stats:shipping:analytics',
    ESCALATIONS_STATS: 'stats:escalations',
    OWNER_DASHBOARD: 'stats:owner:dashboard',
    DASHBOARD_MASTER: 'stats:dashboard:master',
    USER_SESSION: 'session:user',
  };

  constructor(defaultTTL: number = 120) {
    this.cache = new InMemoryCache();
    this.defaultTTL = defaultTTL;
    this.logger.log('CacheService initialized with in-memory cache');
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cache.get(key);
      if (value) {
        this.logger.debug(`Cache HIT: ${key}`);
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
      this.logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      this.logger.warn(`Cache get error for ${key}: ${error.message}`);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number = this.defaultTTL): Promise<void> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.cache.set(key, serialized, ttlSeconds);
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      this.logger.warn(`Cache set error for ${key}: ${error.message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
    } catch (error) {
      this.logger.warn(`Cache del error for ${key}: ${error.message}`);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      await this.cache.delPattern(pattern);
      this.logger.debug(`Cache DEL pattern: ${pattern}`);
    } catch (error) {
      this.logger.warn(`Cache delPattern error for ${pattern}: ${error.message}`);
    }
  }

  /**
   * Get from cache or compute and store
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds: number = this.defaultTTL): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Wrapper function for caching any async operation
   */
  async wrap<T>(key: string, fn: () => Promise<T>, ttlSeconds: number = this.defaultTTL): Promise<T> {
    return this.getOrSet(key, fn, ttlSeconds);
  }

  /**
   * Invalidate all stats caches
   */
  async invalidateStats(): Promise<void> {
    await this.delPattern('stats:*');
    this.logger.log('All stats caches invalidated');
  }

  /**
   * Invalidate specific entity caches
   */
  async invalidateEntity(entity: 'leads' | 'deals' | 'contracts' | 'invoices' | 'shipping'): Promise<void> {
    await this.delPattern(`stats:${entity}*`);
    this.logger.log(`Cache invalidated for entity: ${entity}`);
  }
}

// Provider token
export const CACHE_SERVICE = 'CACHE_SERVICE';

@Global()
@Module({})
export class CacheModule {
  static forRoot(): DynamicModule {
    return {
      module: CacheModule,
      providers: [
        {
          provide: CACHE_SERVICE,
          useFactory: () => {
            return new CacheService(120); // 2 minutes default TTL
          },
        },
      ],
      exports: [CACHE_SERVICE],
    };
  }
}
