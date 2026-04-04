/**
 * Advanced Analytics Controller
 * 
 * Routes:
 * GET /api/analytics/manager/:id    - Manager analytics
 * GET /api/analytics/team/:id       - Team lead analytics
 * GET /api/analytics/owner          - Owner dashboard analytics
 * GET /api/analytics/daily          - Daily summary
 * GET /api/analytics/funnel         - Conversion funnel
 */

import { Controller, Get, Param, Query } from '@nestjs/common';
import { AdvancedAnalyticsService } from './advanced-analytics.service';

@Controller('analytics')
export class AdvancedAnalyticsController {
  constructor(private readonly analyticsService: AdvancedAnalyticsService) {}

  @Get('manager/:id')
  async getManagerAnalytics(
    @Param('id') managerId: string,
    @Query('period') period?: string
  ) {
    const periodDays = parseInt(period || '7', 10);
    return this.analyticsService.getManagerAnalytics(managerId, periodDays);
  }

  @Get('team/:id')
  async getTeamAnalytics(
    @Param('id') teamLeadId: string,
    @Query('period') period?: string
  ) {
    const periodDays = parseInt(period || '7', 10);
    return this.analyticsService.getTeamAnalytics(teamLeadId, periodDays);
  }

  @Get('owner')
  async getOwnerAnalytics(@Query('period') period?: string) {
    const periodDays = parseInt(period || '30', 10);
    return this.analyticsService.getOwnerAnalytics(periodDays);
  }

  @Get('daily')
  async getDailySummary() {
    return this.analyticsService.getDailySummary();
  }

  @Get('funnel')
  async getFunnel(@Query('period') period?: string) {
    const periodDays = parseInt(period || '30', 10);
    const owner = await this.analyticsService.getOwnerAnalytics(periodDays);
    return owner.funnel;
  }
}
