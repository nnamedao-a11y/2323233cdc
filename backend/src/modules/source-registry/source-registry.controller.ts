/**
 * Source Registry Controller
 * 
 * Admin API для керування джерелами VIN + auto-optimization
 */

import { Controller, Get, Patch, Param, Body, UseGuards, Post } from '@nestjs/common';
import { SourceRegistryService } from './source-registry.service';
import { SourceOptimizationService } from './source-optimization.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('admin/sources')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SourceRegistryController {
  constructor(
    private readonly service: SourceRegistryService,
    private readonly optimization: SourceOptimizationService,
  ) {}

  /**
   * GET /api/admin/sources - список всіх джерел з stats
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getAll() {
    const sources = await this.service.getAll();
    const stats = await this.service.getStats();
    return { sources, stats };
  }

  /**
   * GET /api/admin/sources/enabled - тільки активні
   */
  @Get('enabled')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getEnabled() {
    return this.service.getEnabledSources();
  }

  /**
   * GET /api/admin/sources/report - optimization report
   */
  @Get('report')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getReport() {
    return this.optimization.getReport();
  }

  /**
   * PATCH /api/admin/sources/:name/toggle - вкл/викл джерело
   */
  @Patch(':name/toggle')
  @Roles(UserRole.OWNER)
  async toggle(
    @Param('name') name: string,
    @Body() body: { enabled: boolean },
  ) {
    await this.service.toggle(name, body.enabled);
    return { success: true, message: `Source ${name} ${body.enabled ? 'enabled' : 'disabled'}` };
  }

  /**
   * PATCH /api/admin/sources/:name/weight - змінити manual weight
   */
  @Patch(':name/weight')
  @Roles(UserRole.OWNER)
  async updateWeight(
    @Param('name') name: string,
    @Body() body: { weight: number },
  ) {
    await this.service.updateManualWeight(name, body.weight);
    return { success: true, message: `Manual weight for ${name} updated to ${body.weight}` };
  }

  /**
   * POST /api/admin/sources/:name/reset-stats - скинути статистику
   */
  @Post(':name/reset-stats')
  @Roles(UserRole.OWNER)
  async resetStats(@Param('name') name: string) {
    await this.service.resetStats(name);
    return { success: true, message: `Stats for ${name} reset` };
  }

  /**
   * POST /api/admin/sources/recompute - примусово перерахувати всі ваги
   */
  @Post('recompute')
  @Roles(UserRole.OWNER)
  async recompute() {
    const result = await this.optimization.recomputeAll();
    return { 
      success: true, 
      message: `Recomputed: ${result.updated} updated, ${result.disabled} disabled, ${result.enabled} enabled`,
      ...result,
    };
  }

  /**
   * POST /api/admin/sources/:name/auto-enable - примусово ввімкнути auto-disabled джерело
   */
  @Post(':name/auto-enable')
  @Roles(UserRole.OWNER)
  async autoEnable(@Param('name') name: string) {
    await this.service.autoEnable(name);
    return { success: true, message: `Source ${name} force-enabled` };
  }
}
