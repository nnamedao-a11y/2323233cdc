/**
 * Proxy Pool Service
 * 
 * Manages proxy rotation with cooldown and failure tracking
 */

import { Injectable } from '@nestjs/common';

export interface ProxyEndpoint {
  id: string;
  url: string;
  failCount: number;
  successCount: number;
  cooldownUntil?: number;
  lastUsed?: number;
}

@Injectable()
export class ProxyPoolService {
  private proxies: ProxyEndpoint[] = [];
  private currentIndex = 0;

  constructor() {
    // Load proxies from environment or config
    const proxyList = process.env.PROXY_URLS?.split(',').filter(Boolean) || [];
    this.setProxies(proxyList);
  }

  setProxies(proxyUrls: string[]) {
    this.proxies = proxyUrls.map((url, index) => ({
      id: `proxy_${index + 1}`,
      url: url.trim(),
      failCount: 0,
      successCount: 0,
    }));
    console.log(`[ProxyPool] Loaded ${this.proxies.length} proxies`);
  }

  hasProxies(): boolean {
    return this.proxies.length > 0;
  }

  getNextProxy(): ProxyEndpoint | null {
    if (!this.hasProxies()) return null;

    const now = Date.now();
    const available = this.proxies.filter(
      (p) => !p.cooldownUntil || p.cooldownUntil < now,
    );

    if (!available.length) {
      console.log('[ProxyPool] All proxies in cooldown');
      return null;
    }

    // Sort by fail count (prefer healthier proxies)
    available.sort((a, b) => a.failCount - b.failCount);

    const proxy = available[0];
    proxy.lastUsed = now;
    return proxy;
  }

  // Round-robin selection
  getNextProxyRoundRobin(): ProxyEndpoint | null {
    if (!this.hasProxies()) return null;

    const now = Date.now();
    let attempts = 0;
    
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex % this.proxies.length];
      this.currentIndex++;
      
      if (!proxy.cooldownUntil || proxy.cooldownUntil < now) {
        proxy.lastUsed = now;
        return proxy;
      }
      
      attempts++;
    }

    return null;
  }

  reportSuccess(proxyId: string) {
    const proxy = this.proxies.find((p) => p.id === proxyId);
    if (!proxy) return;
    
    proxy.failCount = Math.max(0, proxy.failCount - 1);
    proxy.successCount += 1;
    proxy.cooldownUntil = undefined;
  }

  reportFailure(proxyId: string) {
    const proxy = this.proxies.find((p) => p.id === proxyId);
    if (!proxy) return;

    proxy.failCount += 1;

    // Exponential cooldown: 1min, 2min, 5min, 10min, 15min max
    const cooldownMs = Math.min(15 * 60 * 1000, proxy.failCount * 60 * 1000);
    proxy.cooldownUntil = Date.now() + cooldownMs;
    
    console.log(`[ProxyPool] ${proxyId} failed (${proxy.failCount}), cooldown ${cooldownMs/1000}s`);
  }

  getStats() {
    return {
      total: this.proxies.length,
      available: this.proxies.filter(p => !p.cooldownUntil || p.cooldownUntil < Date.now()).length,
      proxies: this.proxies.map(p => ({
        id: p.id,
        failCount: p.failCount,
        successCount: p.successCount,
        inCooldown: p.cooldownUntil ? p.cooldownUntil > Date.now() : false,
      })),
    };
  }
}
