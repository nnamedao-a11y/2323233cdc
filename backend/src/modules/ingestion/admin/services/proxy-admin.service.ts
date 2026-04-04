/**
 * Proxy Admin Service
 */

import { Injectable } from '@nestjs/common';
import { EnhancedProxyPoolService, ProxyConfig, ProxyTestResult } from '../../antiblock/enhanced-proxy-pool.service';
import { ParserAlertsService } from './parser-alerts.service';
import { ParserAlertLevel, ParserAlertCode } from '../enums/parser-status.enum';

@Injectable()
export class ProxyAdminService {
  constructor(
    private readonly proxyPool: EnhancedProxyPoolService,
    private readonly alertsService: ParserAlertsService,
  ) {}

  getAll() {
    return this.proxyPool.getStatus();
  }

  async add(
    server: string,
    username?: string,
    password?: string,
    priority?: number,
  ) {
    const result = await this.proxyPool.addProxy(server, username, password, priority);

    // Resolve proxy pool empty alert if we have proxies now
    const status = this.proxyPool.getStatus();
    if (status.enabled > 0) {
      await this.alertsService.resolveByCode('system', ParserAlertCode.PROXY_POOL_EMPTY, 'system');
    }

    return result;
  }

  async setPriority(id: number, priority: number) {
    return this.proxyPool.setPriority(id, priority);
  }

  async enable(id: number) {
    const result = await this.proxyPool.enableProxy(id);
    
    // Resolve proxy pool empty alert
    const status = this.proxyPool.getStatus();
    if (status.enabled > 0) {
      await this.alertsService.resolveByCode('system', ParserAlertCode.PROXY_POOL_EMPTY, 'system');
    }

    return result;
  }

  async disable(id: number) {
    const result = await this.proxyPool.disableProxy(id);

    // Check if we need to create alert
    const status = this.proxyPool.getStatus();
    if (status.enabled === 0 && status.total > 0) {
      await this.alertsService.createProxyAlert(
        ParserAlertLevel.CRITICAL,
        ParserAlertCode.PROXY_POOL_EMPTY,
        'All proxies disabled',
        { totalProxies: status.total },
      );
    }

    return result;
  }

  async remove(id: number) {
    return this.proxyPool.removeProxy(id);
  }

  async test(id?: number): Promise<{ results: ProxyTestResult[] }> {
    return this.proxyPool.testProxy(id);
  }

  async checkPoolHealth(): Promise<void> {
    const status = this.proxyPool.getStatus();

    if (status.total === 0) {
      // No proxies configured - not necessarily an alert
      return;
    }

    if (status.enabled === 0) {
      await this.alertsService.createProxyAlert(
        ParserAlertLevel.CRITICAL,
        ParserAlertCode.PROXY_POOL_EMPTY,
        'No active proxies available',
        { totalProxies: status.total },
      );
    } else if (status.available < status.total * 0.3) {
      // Less than 30% available
      await this.alertsService.createProxyAlert(
        ParserAlertLevel.WARNING,
        ParserAlertCode.PROXY_POOL_DEGRADED,
        'Proxy pool degraded',
        { available: status.available, total: status.total },
      );
    }
  }
}
