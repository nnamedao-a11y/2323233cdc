import { Controller, Get, Post, UseGuards, Body, HttpCode } from '@nestjs/common';
import { BootstrapService, BootstrapStatus } from './bootstrap.service';
import { SeedService, SeedResult } from './seed.service';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../modules/auth/guards/roles.guard';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { UserRole } from '../shared/enums';

/**
 * System Controller v2.0 - Health checks та системні операції
 */
@Controller('system')
export class SystemController {
  constructor(
    private bootstrapService: BootstrapService,
    private seedService: SeedService,
  ) {}

  /**
   * Health check - публічний endpoint
   */
  @Get('health')
  healthCheck() {
    const status = this.bootstrapService.getStatus();
    return {
      status: status.ready ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: status.version,
      uptime: process.uptime(),
      services: {
        mongodb: status.mongodb,
        redis: status.redis,
      },
    };
  }

  /**
   * Detailed status - для адмінів
   */
  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  getStatus(): BootstrapStatus {
    return this.bootstrapService.getStatus();
  }

  /**
   * Readiness check - для Kubernetes
   */
  @Get('ready')
  readinessCheck() {
    const isReady = this.bootstrapService.isReady();
    if (!isReady) {
      throw new Error('Service not ready');
    }
    return { ready: true };
  }

  /**
   * Liveness check - для Kubernetes
   */
  @Get('live')
  livenessCheck() {
    return { alive: true, timestamp: new Date().toISOString() };
  }

  /**
   * Re-run bootstrap (admin only)
   */
  @Post('bootstrap')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async reRunBootstrap(): Promise<BootstrapStatus> {
    return this.bootstrapService.quickBoot();
  }

  /**
   * Run seed (admin only)
   */
  @Post('seed')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async runSeed(@Body() body?: { includeTestLeads?: boolean; testLeadsCount?: number }): Promise<SeedResult & { testLeads?: number }> {
    const result = await this.seedService.seedAll();
    
    if (body?.includeTestLeads) {
      const testLeads = await this.seedService.seedTestLeads(body.testLeadsCount || 10);
      return { ...result, testLeads };
    }
    
    return result;
  }

  /**
   * Seed missing data only (admin only)
   */
  @Post('seed/missing')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async seedMissing(): Promise<{ success: boolean; message: string }> {
    await this.seedService.seedMissing();
    return { success: true, message: 'Missing data seeded' };
  }

  /**
   * Seed test customers (admin only)
   */
  @Post('seed/test-customers')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async seedTestCustomers(): Promise<{ created: number }> {
    const count = await this.seedService.seedTestCustomers();
    return { created: count };
  }

  /**
   * Seed test leads (admin only)
   */
  @Post('seed/test-leads')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async seedTestLeads(@Body() body?: { count?: number }): Promise<{ created: number }> {
    const count = await this.seedService.seedTestLeads(body?.count || 10);
    return { created: count };
  }

  /**
   * Clear test data (admin only)
   */
  @Post('clear-test-data')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async clearTestData(): Promise<{ success: boolean }> {
    await this.seedService.clearTestData();
    return { success: true };
  }

  /**
   * Get system info
   */
  @Get('info')
  getInfo() {
    const status = this.bootstrapService.getStatus();
    return {
      name: 'BIBI Cars CRM',
      version: status.version,
      environment: process.env.NODE_ENV || 'development',
      startedAt: status.startedAt,
      uptime: process.uptime(),
      node: process.version,
      platform: process.platform,
    };
  }
}
