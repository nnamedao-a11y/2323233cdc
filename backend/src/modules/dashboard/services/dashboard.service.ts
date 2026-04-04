import { Injectable, Inject, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { MasterDashboardResponse, DashboardKpiSummary } from '../interfaces/dashboard-response.interface';
import { SlaDashboardService } from './sla-dashboard.service';
import { WorkloadDashboardService } from './workload-dashboard.service';
import { LeadsDashboardService } from './leads-dashboard.service';
import { CallbacksDashboardService } from './callbacks-dashboard.service';
import { DepositsDashboardService } from './deposits-dashboard.service';
import { DocumentsDashboardService } from './documents-dashboard.service';
import { RoutingDashboardService } from './routing-dashboard.service';
import { SystemHealthDashboardService } from './system-health-dashboard.service';
import { VehiclesDashboardService } from './vehicles-dashboard.service';
import { DASHBOARD_CACHE } from '../constants/dashboard-cache.constants';

@Injectable()
export class DashboardService {
  private redis: Redis | null = null;

  constructor(
    private readonly slaDashboardService: SlaDashboardService,
    private readonly workloadDashboardService: WorkloadDashboardService,
    private readonly leadsDashboardService: LeadsDashboardService,
    private readonly callbacksDashboardService: CallbacksDashboardService,
    private readonly depositsDashboardService: DepositsDashboardService,
    private readonly documentsDashboardService: DocumentsDashboardService,
    private readonly routingDashboardService: RoutingDashboardService,
    private readonly systemHealthDashboardService: SystemHealthDashboardService,
    private readonly vehiclesDashboardService: VehiclesDashboardService,
  ) {
    // Try to connect to Redis, but don't fail if unavailable
    try {
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
      this.redis = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: 1 });
      this.redis.on('error', () => {
        this.redis = null;
      });
    } catch {
      this.redis = null;
    }
  }

  async getMasterDashboard(
    query: DashboardQueryDto,
    userId?: string,
  ): Promise<MasterDashboardResponse> {
    const cacheKey = this.buildCacheKey(query, userId);

    // Try to get from cache if not forcing refresh
    if (!query.refresh && this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch {
        // Cache miss or error, continue to compute
      }
    }

    // Fetch all metrics in parallel
    const [sla, workload, leads, callbacks, deposits, documents, routing, system, vehicles] =
      await Promise.all([
        this.slaDashboardService.getMetrics(query),
        this.workloadDashboardService.getMetrics(query),
        this.leadsDashboardService.getMetrics(query),
        this.callbacksDashboardService.getMetrics(query),
        this.depositsDashboardService.getMetrics(query),
        this.documentsDashboardService.getMetrics(query),
        this.routingDashboardService.getMetrics(query),
        this.systemHealthDashboardService.getMetrics(query),
        this.vehiclesDashboardService.getVehiclesDashboard(),
      ]);

    const result: MasterDashboardResponse = {
      generatedAt: new Date().toISOString(),
      period: query.period || 'day',
      sla,
      workload,
      leads,
      callbacks,
      deposits,
      documents,
      routing,
      system,
      vehicles,
    };

    // Save to cache
    if (this.redis) {
      try {
        await this.redis.setex(
          cacheKey,
          DASHBOARD_CACHE.TTL_SECONDS,
          JSON.stringify(result),
        );
      } catch {
        // Cache save error, continue
      }
    }

    return result;
  }

  async getKpiSummary(query: DashboardQueryDto): Promise<DashboardKpiSummary> {
    const [sla, deposits, documents, workload, system] = await Promise.all([
      this.slaDashboardService.getMetrics(query),
      this.depositsDashboardService.getMetrics(query),
      this.documentsDashboardService.getMetrics(query),
      this.workloadDashboardService.getMetrics(query),
      this.systemHealthDashboardService.getMetrics(query),
    ]);

    // Calculate critical alerts
    let criticalAlerts = 0;
    if (sla.overdueLeads > 10) criticalAlerts++;
    if (deposits.depositsWithoutProof > 5) criticalAlerts++;
    if (documents.pendingVerification > 10) criticalAlerts++;
    if (workload.overloadedManagers > 2) criticalAlerts++;
    if (system.systemStatus === 'critical') criticalAlerts++;

    return {
      newLeadsToday: 0, // Will be calculated from leads service
      overdueLeads: sla.overdueLeads,
      pendingDeposits: deposits.pendingDeposits,
      pendingVerificationDocs: documents.pendingVerification,
      overloadedManagers: workload.overloadedManagers,
      failedJobs: system.failedJobs,
      criticalAlerts,
    };
  }

  private buildCacheKey(query: DashboardQueryDto, userId?: string): string {
    const parts = [
      DASHBOARD_CACHE.MASTER_KEY_PREFIX,
      query.period || 'day',
      query.teamId || 'all',
      query.managerId || 'all',
      query.market || 'all',
    ];
    return parts.join(':');
  }
}
