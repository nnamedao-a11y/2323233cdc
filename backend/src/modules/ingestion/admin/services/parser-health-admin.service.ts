/**
 * Parser Health Service (Admin)
 */

import { Injectable } from '@nestjs/common';
import { ParserStateRepository } from '../repositories/parser-state.repository';
import { ParserLogRepository } from '../repositories/parser-log.repository';
import { ParserAlertRepository } from '../repositories/parser-alert.repository';
import { CircuitBreakerService, EnhancedProxyPoolService } from '../../antiblock';
import { ParserStatus } from '../enums/parser-status.enum';

export interface HealthOverview {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  parsers: Array<{
    source: string;
    status: ParserStatus;
    lastRunAt?: Date;
    lastSuccessAt?: Date;
    consecutiveFailures: number;
    circuitState: string;
    isPaused: boolean;
  }>;
  proxies: {
    total: number;
    enabled: number;
    available: number;
    inCooldown: number;
  };
  alerts: {
    critical: number;
    warning: number;
    info: number;
  };
  metrics: {
    successRate24h: number;
    errorsLastHour: number;
    totalVehicles: number;
  };
}

@Injectable()
export class ParserHealthAdminService {
  constructor(
    private readonly stateRepo: ParserStateRepository,
    private readonly logRepo: ParserLogRepository,
    private readonly alertRepo: ParserAlertRepository,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly proxyPool: EnhancedProxyPoolService,
  ) {}

  async getOverview(): Promise<HealthOverview> {
    const [states, alertCounts, logStats, proxyStatus] = await Promise.all([
      this.stateRepo.findAll(),
      this.alertRepo.countActive(),
      this.logRepo.countByLevelLastHour(),
      Promise.resolve(this.proxyPool.getStatus()),
    ]);

    // Calculate overall status
    let overallStatus: HealthOverview['status'] = 'healthy';
    
    if (alertCounts['critical'] > 0) {
      overallStatus = 'critical';
    } else if (alertCounts['warning'] > 0) {
      overallStatus = 'degraded';
    } else if (states.some(s => s.status === ParserStatus.ERROR)) {
      overallStatus = 'degraded';
    }

    // Calculate metrics
    const totalErrors = states.reduce((sum, s) => sum + (s.errorsCount || 0), 0);
    const totalParsed = states.reduce((sum, s) => sum + (s.itemsParsed || 0), 0);
    const successRate = totalParsed > 0 
      ? Math.round(((totalParsed - totalErrors) / totalParsed) * 100 * 10) / 10
      : 100;

    return {
      status: overallStatus,
      parsers: states.map(s => ({
        source: s.source,
        status: s.status,
        lastRunAt: s.lastRunAt,
        lastSuccessAt: s.lastSuccessAt,
        consecutiveFailures: s.consecutiveFailures || 0,
        circuitState: this.circuitBreaker.getState(`${s.source}_main`)?.state || 'closed',
        isPaused: s.isPaused || false,
      })),
      proxies: {
        total: proxyStatus.total,
        enabled: proxyStatus.enabled,
        available: proxyStatus.available,
        inCooldown: proxyStatus.total - proxyStatus.available,
      },
      alerts: {
        critical: alertCounts['critical'] || 0,
        warning: alertCounts['warning'] || 0,
        info: alertCounts['info'] || 0,
      },
      metrics: {
        successRate24h: successRate,
        errorsLastHour: logStats['error'] || 0,
        totalVehicles: totalParsed,
      },
    };
  }

  async getSourceHealth(source: string) {
    const state = await this.stateRepo.findBySource(source);
    const circuitState = this.circuitBreaker.getState(`${source}_main`);
    const logStats = await this.logRepo.countByLevelLastHour(source);

    return {
      source,
      status: state?.status || ParserStatus.STOPPED,
      consecutiveFailures: state?.consecutiveFailures || 0,
      lastRunAt: state?.lastRunAt,
      lastSuccessAt: state?.lastSuccessAt,
      lastDurationMs: state?.lastDurationMs,
      itemsParsed: state?.itemsParsed || 0,
      itemsCreated: state?.itemsCreated || 0,
      itemsUpdated: state?.itemsUpdated || 0,
      errorsCount: state?.errorsCount || 0,
      circuitState: circuitState?.state || 'closed',
      circuitFailures: circuitState?.failures || 0,
      isPaused: state?.isPaused || false,
      pauseReason: state?.pauseReason,
      healthSnapshot: state?.healthSnapshot,
      errorsLastHour: logStats['error'] || 0,
      warningsLastHour: logStats['warn'] || 0,
    };
  }
}
