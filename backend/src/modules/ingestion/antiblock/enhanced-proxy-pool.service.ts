/**
 * Enhanced Proxy Pool Service
 * 
 * UPGRADED: Failover (NOT rotation!) + MongoDB persistence
 * Restored from Python version
 * 
 * Features:
 * - Priority-based failover (not round-robin)
 * - MongoDB persistence for restart recovery
 * - Admin API for management
 * - Per-proxy success/error tracking
 * - Test proxy connectivity
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';

export interface ProxyConfig {
  id: number;
  server: string;
  priority: number;
  enabled: boolean;
  username?: string;
  password?: string;
  last_success_at?: Date;
  last_error?: string;
  success_count: number;
  error_count: number;
  cooldown_until?: number;
}

export interface ProxyTestResult {
  id: number;
  server: string;
  tests: Array<{
    target: string;
    url: string;
    status: number;
    success: boolean;
    error?: string;
    latency_ms?: number;
  }>;
}

@Injectable()
export class EnhancedProxyPoolService implements OnModuleInit {
  private readonly logger = new Logger(EnhancedProxyPoolService.name);
  
  private proxies: ProxyConfig[] = [];
  private nextId = 1;
  private db: any = null;
  private loadedFromDb = false;

  async onModuleInit() {
    await this.loadFromDb();
  }

  // ═══════════════════════════════════════════════════════════════
  // DATABASE PERSISTENCE
  // ═══════════════════════════════════════════════════════════════

  private async getDb() {
    if (this.db) return this.db;

    try {
      const { MongoClient } = await import('mongodb');
      const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
      const dbName = process.env.DB_NAME || 'fomo_market';
      
      const client = new MongoClient(mongoUrl);
      await client.connect();
      this.db = client.db(dbName);
      return this.db;
    } catch (error) {
      this.logger.error(`[Proxy] Failed to connect to DB: ${error}`);
      return null;
    }
  }

  async loadFromDb(): Promise<void> {
    if (this.loadedFromDb) return;

    try {
      const db = await this.getDb();
      if (!db) {
        this.loadFromEnv();
        return;
      }

      const docs = await db.collection('system_proxies').find({}).toArray();

      if (docs.length > 0) {
        for (const doc of docs) {
          const proxy: ProxyConfig = {
            id: doc.id || this.nextId++,
            server: doc.server,
            priority: doc.priority || 1,
            enabled: doc.enabled !== false,
            username: doc.username,
            password: doc.password,
            success_count: doc.success_count || 0,
            error_count: doc.error_count || 0,
            last_error: doc.last_error,
          };
          this.proxies.push(proxy);
          if (proxy.id >= this.nextId) {
            this.nextId = proxy.id + 1;
          }
        }
        this.logger.log(`[Proxy] Loaded ${this.proxies.length} proxies from MongoDB`);
      } else {
        this.loadFromEnv();
      }

      this.loadedFromDb = true;
    } catch (error) {
      this.logger.error(`[Proxy] Failed to load from DB: ${error}`);
      this.loadFromEnv();
    }
  }

  async saveToDb(): Promise<void> {
    try {
      const db = await this.getDb();
      if (!db) return;

      await db.collection('system_proxies').deleteMany({});

      for (const proxy of this.proxies) {
        await db.collection('system_proxies').insertOne({
          id: proxy.id,
          server: proxy.server,
          priority: proxy.priority,
          enabled: proxy.enabled,
          username: proxy.username,
          password: proxy.password,
          success_count: proxy.success_count,
          error_count: proxy.error_count,
          last_error: proxy.last_error,
          updated_at: new Date(),
        });
      }

      this.logger.log(`[Proxy] Saved ${this.proxies.length} proxies to MongoDB`);
    } catch (error) {
      this.logger.error(`[Proxy] Failed to save to DB: ${error}`);
    }
  }

  private loadFromEnv(): void {
    const proxyUrls = process.env.PROXY_URLS?.split(',').filter(Boolean) || [];
    
    for (let i = 0; i < proxyUrls.length; i++) {
      this.addProxyFromUrl(proxyUrls[i], i + 1);
    }

    if (this.proxies.length > 0) {
      this.logger.log(`[Proxy] Loaded ${this.proxies.length} proxies from env`);
    } else {
      this.logger.log('[Proxy] No proxies configured - direct connection');
    }
  }

  private addProxyFromUrl(url: string, priority: number): void {
    try {
      let server = url.trim();
      let username: string | undefined;
      let password: string | undefined;

      if (server.includes('@')) {
        const [protoAuth, hostPort] = server.split('@');
        const [proto, auth] = protoAuth.split('://');
        [username, password] = auth.split(':');
        server = `${proto}://${hostPort}`;
      }

      this.proxies.push({
        id: this.nextId++,
        server,
        priority,
        enabled: true,
        username,
        password,
        success_count: 0,
        error_count: 0,
      });
    } catch (error) {
      this.logger.error(`[Proxy] Failed to parse: ${error}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PROXY SELECTION - FAILOVER (NOT ROTATION!)
  // ═══════════════════════════════════════════════════════════════

  private getSortedProxies(): ProxyConfig[] {
    const now = Date.now();
    return this.proxies
      .filter(p => p.enabled && (!p.cooldown_until || p.cooldown_until < now))
      .sort((a, b) => a.priority - b.priority);
  }

  hasProxies(): boolean {
    return this.proxies.length > 0;
  }

  hasEnabledProxy(): boolean {
    return this.proxies.some(p => p.enabled);
  }

  getPrimaryProxy(): ProxyConfig | null {
    const sorted = this.getSortedProxies();
    return sorted[0] || null;
  }

  getProxyUrl(proxy: ProxyConfig): string {
    if (proxy.username && proxy.password) {
      const [proto, rest] = proxy.server.split('://');
      return `${proto}://${proxy.username}:${proxy.password}@${rest}`;
    }
    return proxy.server;
  }

  getAxiosProxy(proxy: ProxyConfig): { host: string; port: number; auth?: { username: string; password: string } } | undefined {
    try {
      const url = new URL(proxy.server);
      const result: any = {
        host: url.hostname,
        port: parseInt(url.port || '80', 10),
      };
      
      if (proxy.username && proxy.password) {
        result.auth = {
          username: proxy.username,
          password: proxy.password,
        };
      }
      
      return result;
    } catch {
      return undefined;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FAILOVER REQUEST
  // ═══════════════════════════════════════════════════════════════

  async requestWithFailover<T>(
    requestFn: (proxyConfig: { host: string; port: number; auth?: any } | undefined) => Promise<T>,
  ): Promise<T> {
    const proxies = this.getSortedProxies();

    if (proxies.length === 0) {
      // No proxy - direct connection
      return requestFn(undefined);
    }

    let lastError: Error | null = null;

    for (const proxy of proxies) {
      try {
        const proxyConfig = this.getAxiosProxy(proxy);
        const result = await requestFn(proxyConfig);

        // Success
        proxy.success_count++;
        proxy.last_success_at = new Date();
        proxy.last_error = undefined;
        proxy.cooldown_until = undefined;

        return result;
      } catch (error: any) {
        proxy.error_count++;
        proxy.last_error = error.message;
        lastError = error;

        // Exponential cooldown: 1min, 2min, 5min, 10min, 15min max
        const cooldownMs = Math.min(15 * 60 * 1000, proxy.error_count * 60 * 1000);
        proxy.cooldown_until = Date.now() + cooldownMs;

        this.logger.warn(`[Proxy] ${proxy.id} failed: ${error.message}, trying next...`);
        continue;
      }
    }

    throw new Error(`All proxies failed. Last error: ${lastError?.message}`);
  }

  reportSuccess(proxyId: number): void {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) return;

    proxy.success_count++;
    proxy.error_count = Math.max(0, proxy.error_count - 1);
    proxy.last_success_at = new Date();
    proxy.cooldown_until = undefined;
  }

  reportFailure(proxyId: number, error?: string): void {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) return;

    proxy.error_count++;
    proxy.last_error = error;

    const cooldownMs = Math.min(15 * 60 * 1000, proxy.error_count * 60 * 1000);
    proxy.cooldown_until = Date.now() + cooldownMs;

    this.logger.warn(`[Proxy] ${proxyId} failed (${proxy.error_count}), cooldown ${cooldownMs / 1000}s`);
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN API
  // ═══════════════════════════════════════════════════════════════

  async addProxy(
    server: string,
    username?: string,
    password?: string,
    priority?: number,
  ): Promise<{ id: number; priority: number }> {
    if (priority === undefined) {
      priority = Math.max(...this.proxies.map(p => p.priority), 0) + 1;
    }

    const proxy: ProxyConfig = {
      id: this.nextId++,
      server,
      priority,
      enabled: true,
      username,
      password,
      success_count: 0,
      error_count: 0,
    };

    this.proxies.push(proxy);
    await this.saveToDb();

    this.logger.log(`[Proxy] Added proxy ${proxy.id}: ${server}`);
    return { id: proxy.id, priority };
  }

  async removeProxy(proxyId: number): Promise<{ removed: number }> {
    this.proxies = this.proxies.filter(p => p.id !== proxyId);
    await this.saveToDb();

    this.logger.log(`[Proxy] Removed proxy ${proxyId}`);
    return { removed: proxyId };
  }

  async setPriority(proxyId: number, priority: number): Promise<{ id: number; priority: number } | { error: string }> {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) {
      return { error: `Proxy ${proxyId} not found` };
    }

    proxy.priority = priority;
    await this.saveToDb();

    return { id: proxyId, priority };
  }

  async enableProxy(proxyId: number): Promise<{ id: number; enabled: boolean } | { error: string }> {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) {
      return { error: `Proxy ${proxyId} not found` };
    }

    proxy.enabled = true;
    await this.saveToDb();

    return { id: proxyId, enabled: true };
  }

  async disableProxy(proxyId: number): Promise<{ id: number; enabled: boolean } | { error: string }> {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) {
      return { error: `Proxy ${proxyId} not found` };
    }

    proxy.enabled = false;
    await this.saveToDb();

    return { id: proxyId, enabled: false };
  }

  async clearAll(): Promise<void> {
    this.proxies = [];
    await this.saveToDb();
    this.logger.log('[Proxy] All proxies cleared');
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST
  // ═══════════════════════════════════════════════════════════════

  async testProxy(proxyId?: number): Promise<{ results: ProxyTestResult[] }> {
    const testUrls = [
      { name: 'Binance', url: 'https://fapi.binance.com/fapi/v1/time' },
      { name: 'Bybit', url: 'https://api.bybit.com/v5/market/time' },
      { name: 'Generic', url: 'https://httpbin.org/ip' },
    ];

    let proxiesToTest: ProxyConfig[];

    if (proxyId !== undefined) {
      const proxy = this.proxies.find(p => p.id === proxyId);
      if (!proxy) {
        return { results: [] };
      }
      proxiesToTest = [proxy];
    } else {
      proxiesToTest = this.getSortedProxies();
    }

    const results: ProxyTestResult[] = [];

    for (const proxy of proxiesToTest) {
      const proxyResult: ProxyTestResult = {
        id: proxy.id,
        server: proxy.server,
        tests: [],
      };

      for (const { name, url } of testUrls) {
        const start = Date.now();
        try {
          const response = await axios.get(url, {
            proxy: this.getAxiosProxy(proxy),
            timeout: 15000,
          });

          proxyResult.tests.push({
            target: name,
            url,
            status: response.status,
            success: response.status === 200,
            latency_ms: Date.now() - start,
          });

          if (response.status === 200) {
            proxy.success_count++;
            proxy.last_success_at = new Date();
          }
        } catch (error: any) {
          proxy.error_count++;
          proxy.last_error = error.message;

          proxyResult.tests.push({
            target: name,
            url,
            status: 0,
            success: false,
            error: error.message?.slice(0, 100),
            latency_ms: Date.now() - start,
          });
        }
      }

      results.push(proxyResult);
    }

    return { results };
  }

  // ═══════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════

  getStatus(): {
    configured: boolean;
    total: number;
    enabled: number;
    available: number;
    proxies: Array<{
      id: number;
      server: string;
      priority: number;
      enabled: boolean;
      has_auth: boolean;
      success_count: number;
      error_count: number;
      last_success_at?: Date;
      last_error?: string;
      in_cooldown: boolean;
    }>;
  } {
    const now = Date.now();

    return {
      configured: this.proxies.length > 0,
      total: this.proxies.length,
      enabled: this.proxies.filter(p => p.enabled).length,
      available: this.getSortedProxies().length,
      proxies: this.proxies
        .sort((a, b) => a.priority - b.priority)
        .map(p => ({
          id: p.id,
          server: p.server,
          priority: p.priority,
          enabled: p.enabled,
          has_auth: !!(p.username && p.password),
          success_count: p.success_count,
          error_count: p.error_count,
          last_success_at: p.last_success_at,
          last_error: p.last_error,
          in_cooldown: p.cooldown_until ? p.cooldown_until > now : false,
        })),
    };
  }
}
