/**
 * APM (Application Performance Monitoring) Module
 * 
 * Provides:
 * - Prometheus metrics endpoint (/metrics)
 * - Request duration histograms
 * - Error rate tracking
 * - Cache hit/miss rates
 * - Active connections
 * - Custom business metrics
 */

import { Module, Global, Injectable, NestMiddleware, Logger, Controller, Get, Res } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as promClient from 'prom-client';

// Initialize Prometheus registry
const register = new promClient.Registry();

// Collect default Node.js metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'user_role'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'user_role'],
  registers: [register],
});

const httpRequestsInFlight = new promClient.Gauge({
  name: 'http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  registers: [register],
});

const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'key_prefix'],
  registers: [register],
});

const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type', 'key_prefix'],
  registers: [register],
});

const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['collection', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

const activeUsers = new promClient.Gauge({
  name: 'active_users',
  help: 'Number of currently active users',
  labelNames: ['role'],
  registers: [register],
});

const rateLimitHits = new promClient.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'user_role'],
  registers: [register],
});

const authAttempts = new promClient.Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'status'],
  registers: [register],
});

// Business metrics
const leadsCreated = new promClient.Counter({
  name: 'leads_created_total',
  help: 'Total number of leads created',
  labelNames: ['source', 'manager_id'],
  registers: [register],
});

const dealsWon = new promClient.Counter({
  name: 'deals_won_total',
  help: 'Total number of deals won',
  labelNames: ['manager_id'],
  registers: [register],
});

const contractsSigned = new promClient.Counter({
  name: 'contracts_signed_total',
  help: 'Total number of contracts signed',
  registers: [register],
});

const invoicesPaid = new promClient.Counter({
  name: 'invoices_paid_total',
  help: 'Total number of invoices paid',
  registers: [register],
});

const escalationsCreated = new promClient.Counter({
  name: 'escalations_created_total',
  help: 'Total number of escalations created',
  labelNames: ['priority', 'type'],
  registers: [register],
});

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  // HTTP metrics
  recordRequest(method: string, route: string, statusCode: number, duration: number, userRole?: string): void {
    const labels = {
      method,
      route: this.normalizeRoute(route),
      status_code: statusCode.toString(),
      user_role: userRole || 'anonymous',
    };

    httpRequestDuration.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  }

  incrementInFlight(): void {
    httpRequestsInFlight.inc();
  }

  decrementInFlight(): void {
    httpRequestsInFlight.dec();
  }

  // Cache metrics
  recordCacheHit(cacheType: string, keyPrefix: string): void {
    cacheHits.inc({ cache_type: cacheType, key_prefix: keyPrefix });
  }

  recordCacheMiss(cacheType: string, keyPrefix: string): void {
    cacheMisses.inc({ cache_type: cacheType, key_prefix: keyPrefix });
  }

  // Database metrics
  recordDbQuery(collection: string, operation: string, duration: number): void {
    dbQueryDuration.observe({ collection, operation }, duration);
  }

  // User metrics
  setActiveUsers(role: string, count: number): void {
    activeUsers.set({ role }, count);
  }

  // Rate limit metrics
  recordRateLimitHit(endpoint: string, userRole: string): void {
    rateLimitHits.inc({ endpoint, user_role: userRole });
  }

  // Auth metrics
  recordAuthAttempt(type: 'login' | 'register' | 'refresh', status: 'success' | 'failure'): void {
    authAttempts.inc({ type, status });
  }

  // Business metrics
  recordLeadCreated(source: string, managerId: string): void {
    leadsCreated.inc({ source, manager_id: managerId });
  }

  recordDealWon(managerId: string): void {
    dealsWon.inc({ manager_id: managerId });
  }

  recordContractSigned(): void {
    contractsSigned.inc();
  }

  recordInvoicePaid(): void {
    invoicesPaid.inc();
  }

  recordEscalation(priority: string, type: string): void {
    escalationsCreated.inc({ priority, type });
  }

  // Get metrics
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  private normalizeRoute(route: string): string {
    // Replace dynamic segments with placeholders
    return route
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9]{24}/gi, '/:id');
  }
}

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    this.metricsService.incrementInFlight();

    // Extract user role from JWT
    let userRole = 'anonymous';
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        userRole = payload.role || 'authenticated';
      } catch {
        // Invalid token
      }
    }

    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      this.metricsService.decrementInFlight();
      this.metricsService.recordRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration,
        userRole,
      );
    });

    next();
  }
}

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', register.contentType);
    res.send(await this.metricsService.getMetrics());
  }
}

// Health check with metrics
@Controller('health')
export class HealthController {
  @Get()
  health(): object {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  @Get('ready')
  ready(): object {
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  live(): object {
    return {
      status: 'live',
      timestamp: new Date().toISOString(),
    };
  }
}

@Global()
@Module({
  providers: [MetricsService, MetricsMiddleware],
  controllers: [MetricsController, HealthController],
  exports: [MetricsService, MetricsMiddleware],
})
export class ApmModule {}
