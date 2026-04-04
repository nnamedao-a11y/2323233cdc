/**
 * BIBI Cars - Scoring Controller
 * API endpoints for score management
 */

import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';
import { ScoreType } from './schemas/score-snapshot.schema';

@Controller('scoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  // ═══════════════════════════════════════════════════════════
  // SCORE QUERIES
  // ═══════════════════════════════════════════════════════════

  @Get(':entityType/:entityId')
  async getScore(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('scoreType') scoreType?: ScoreType,
  ) {
    return this.scoringService.getScore(entityType, entityId, scoreType);
  }

  @Get('hot-leads')
  async getHotLeads(@Query('limit') limit?: string) {
    return this.scoringService.getHotLeads(parseInt(limit || '20'));
  }

  @Get('low-health-deals')
  async getLowHealthDeals(@Query('limit') limit?: string) {
    return this.scoringService.getLowHealthDeals(parseInt(limit || '20'));
  }

  @Get('critical-shipments')
  async getCriticalShipments(@Query('limit') limit?: string) {
    return this.scoringService.getCriticalShipments(parseInt(limit || '20'));
  }

  @Get('top-managers')
  async getTopManagers(@Query('limit') limit?: string) {
    return this.scoringService.getTopManagers(parseInt(limit || '10'));
  }

  @Get('weak-managers')
  async getWeakManagers(@Query('limit') limit?: string) {
    return this.scoringService.getWeakManagers(parseInt(limit || '10'));
  }

  @Get('by-type/:scoreType')
  async getByType(
    @Param('scoreType') scoreType: ScoreType,
    @Query('band') band?: string,
    @Query('limit') limit?: string,
  ) {
    return this.scoringService.getScoresByType(scoreType, band as any, parseInt(limit || '50'));
  }

  // ═══════════════════════════════════════════════════════════
  // RULE MANAGEMENT (Owner only)
  // ═══════════════════════════════════════════════════════════

  @Get('rules')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getRules(@Query('scoreType') scoreType?: ScoreType) {
    return this.scoringService.getAllRules(scoreType);
  }

  @Post('rules')
  @Roles(UserRole.OWNER)
  async createRule(@Body() data: any) {
    return this.scoringService.createRule(data);
  }

  @Patch('rules/:code')
  @Roles(UserRole.OWNER)
  async updateRule(@Param('code') code: string, @Body() data: any) {
    return this.scoringService.updateRule(code, data);
  }

  @Patch('rules/:code/toggle')
  @Roles(UserRole.OWNER)
  async toggleRule(@Param('code') code: string, @Body() body: { isActive: boolean }) {
    return this.scoringService.toggleRule(code, body.isActive);
  }

  @Delete('rules/:code')
  @Roles(UserRole.OWNER)
  async deleteRule(@Param('code') code: string) {
    const deleted = await this.scoringService.deleteRule(code);
    return { success: deleted };
  }

  @Post('seed-rules')
  @Roles(UserRole.OWNER)
  async seedRules() {
    await this.scoringService.seedDefaultRules();
    return { success: true, message: 'Default rules seeded' };
  }
}
