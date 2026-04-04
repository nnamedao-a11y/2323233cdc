/**
 * BIBI Cars - Journey Controller
 * API endpoints for journey analytics
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JourneyService } from './journey.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('journey')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JourneyController {
  constructor(private readonly journeyService: JourneyService) {}

  // ═══════════════════════════════════════════════════════════
  // ENTITY TIMELINE
  // ═══════════════════════════════════════════════════════════

  @Get(':entityType/:entityId/timeline')
  async getTimeline(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('limit') limit?: string,
  ) {
    return this.journeyService.getTimeline(entityType, entityId, parseInt(limit || '100'));
  }

  @Get(':entityType/:entityId/snapshot')
  async getSnapshot(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.journeyService.getSnapshot(entityType, entityId);
  }

  // ═══════════════════════════════════════════════════════════
  // FUNNEL ANALYTICS (Owner/Team Lead)
  // ═══════════════════════════════════════════════════════════

  @Get('funnel')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getFunnel(@Query('days') days?: string) {
    return this.journeyService.getFunnelStats(parseInt(days || '30'));
  }

  @Get('bottlenecks')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getBottlenecks(@Query('days') days?: string) {
    return this.journeyService.getBottlenecks(parseInt(days || '30'));
  }

  @Get('durations')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getDurations(@Query('days') days?: string) {
    return this.journeyService.getAverageJourneyDurations(parseInt(days || '30'));
  }

  // ═══════════════════════════════════════════════════════════
  // RECENT EVENTS
  // ═══════════════════════════════════════════════════════════

  @Get('recent')
  async getRecentEvents(
    @Query('entityType') entityType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.journeyService.getRecentEvents(entityType, parseInt(limit || '50'));
  }
}
