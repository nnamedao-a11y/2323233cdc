/**
 * Integration Config Controller
 * 
 * Admin API для керування інтеграціями
 */

import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { IntegrationConfigService } from './integration-config.service';
import { SystemErrorService } from '../system-errors/system-error.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IntegrationProvider, IntegrationMode } from './schemas/integration-config.schema';

@Controller('admin/integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationConfigController {
  constructor(
    private readonly integrationService: IntegrationConfigService,
    private readonly errorService: SystemErrorService,
  ) {}

  /**
   * Get all integration configs (masked)
   */
  @Get()
  async getAllConfigs() {
    return this.integrationService.getAllConfigs();
  }

  /**
   * Get health summary
   */
  @Get('health')
  async getHealthSummary() {
    return this.integrationService.getHealthSummary();
  }

  /**
   * Get single integration config
   */
  @Get(':provider')
  async getConfig(@Param('provider') provider: IntegrationProvider) {
    const config = await this.integrationService.getConfig(provider);
    if (!config) {
      return { error: 'Integration not found' };
    }
    return config;
  }

  /**
   * Update integration config
   */
  @Patch(':provider')
  async updateConfig(
    @Param('provider') provider: IntegrationProvider,
    @Body() body: {
      credentials?: Record<string, string>;
      settings?: Record<string, any>;
      mode?: IntegrationMode;
      isEnabled?: boolean;
    },
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub || 'unknown';
    return this.integrationService.updateConfig(provider, body, userId);
  }

  /**
   * Test integration connection
   */
  @Post(':provider/test')
  async testConnection(@Param('provider') provider: IntegrationProvider) {
    return this.integrationService.testConnection(provider);
  }

  /**
   * Enable/disable integration
   */
  @Post(':provider/toggle')
  async toggleIntegration(
    @Param('provider') provider: IntegrationProvider,
    @Body() body: { isEnabled: boolean },
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'unknown';
    return this.integrationService.updateConfig(provider, { isEnabled: body.isEnabled }, userId);
  }

  /**
   * Get error logs for admin
   */
  @Get('errors/recent')
  async getRecentErrors() {
    return this.errorService.getUnresolvedErrors(100);
  }

  /**
   * Get error statistics
   */
  @Get('errors/stats')
  async getErrorStats() {
    return this.errorService.getErrorStats();
  }

  /**
   * Resolve an error
   */
  @Post('errors/:errorId/resolve')
  async resolveError(
    @Param('errorId') errorId: string,
    @Body() body: { resolution: string },
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'unknown';
    return this.errorService.resolveError(errorId, userId, body.resolution);
  }
}

/**
 * System Health Controller
 */
@Controller('system')
export class SystemHealthController {
  constructor(private readonly integrationService: IntegrationConfigService) {}

  /**
   * Public health endpoint
   */
  @Get('health')
  async getHealth() {
    const healthSummary = await this.integrationService.getHealthSummary();
    
    const status: Record<string, string> = {};
    let allOk = true;

    for (const [provider, data] of Object.entries(healthSummary)) {
      status[provider] = data.status;
      if (data.isEnabled && data.status !== 'ok' && data.status !== 'not_configured') {
        allOk = false;
      }
    }

    return {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '3.2.0',
      integrations: status,
    };
  }
}
