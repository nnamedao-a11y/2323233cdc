/**
 * Source Discovery Controller
 * 
 * Admin API для керування автоматичним пошуком джерел
 */

import { Controller, Get, Post, Param, Body, UseGuards, Query } from '@nestjs/common';
import { SourceDiscoveryService } from './source-discovery.service';
import { SourceOnboardingService } from './source-onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('admin/discovery')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SourceDiscoveryController {
  constructor(
    private readonly discovery: SourceDiscoveryService,
    private readonly onboarding: SourceOnboardingService,
  ) {}

  /**
   * GET /api/admin/discovery - список всіх знайдених джерел
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getAll() {
    const sources = await this.discovery.getAll();
    const stats = await this.discovery.getStats();
    return { sources, stats };
  }

  /**
   * GET /api/admin/discovery/stats - статистика discovery
   */
  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getStats() {
    return this.discovery.getStats();
  }

  /**
   * GET /api/admin/discovery/candidates - джерела готові до promotion
   */
  @Get('candidates')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getCandidates(
    @Query('minReliability') minReliability?: string,
    @Query('minCheckCount') minCheckCount?: string,
  ) {
    const candidates = await this.discovery.getPromotionCandidates(
      minReliability ? parseFloat(minReliability) : 0.6,
      minCheckCount ? parseInt(minCheckCount, 10) : 3,
    );
    return { candidates, count: candidates.length };
  }

  /**
   * POST /api/admin/discovery/promote - запустити promotion вручну
   */
  @Post('promote')
  @Roles(UserRole.OWNER)
  async promote(
    @Body() body?: { minReliability?: number; minCheckCount?: number },
  ) {
    const result = await this.onboarding.promoteSources(
      body?.minReliability ?? 0.6,
      body?.minCheckCount ?? 3,
    );
    return {
      success: true,
      message: `Promoted ${result.promoted} sources, ${result.failed} failed`,
      ...result,
    };
  }

  /**
   * POST /api/admin/discovery/:domain/force-promote - примусово додати джерело
   */
  @Post(':domain/force-promote')
  @Roles(UserRole.OWNER)
  async forcePromote(@Param('domain') domain: string) {
    const success = await this.onboarding.forcePromote(domain);
    return {
      success,
      message: success
        ? `Successfully promoted ${domain} to registry`
        : `Failed to promote ${domain}`,
    };
  }
}
