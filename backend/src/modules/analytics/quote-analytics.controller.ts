/**
 * Quote Analytics Controller
 * 
 * Endpoints:
 * GET /api/admin/quote-analytics - Full dashboard
 * GET /api/admin/quote-analytics/overview - Overview metrics
 * GET /api/admin/quote-analytics/scenarios - Scenario performance
 * GET /api/admin/quote-analytics/managers - Manager performance
 * GET /api/admin/quote-analytics/sources - Source performance
 * GET /api/admin/quote-analytics/timeline - Timeline data
 * GET /api/admin/quote-analytics/lost-revenue - Lost revenue analysis
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QuoteAnalyticsService } from './quote-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin/quote-analytics')
@UseGuards(JwtAuthGuard)
export class QuoteAnalyticsController {
  constructor(
    private readonly analyticsService: QuoteAnalyticsService,
  ) {}

  @Get()
  getDashboard() {
    return this.analyticsService.getFullDashboard();
  }

  @Get('overview')
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('scenarios')
  getScenarios() {
    return this.analyticsService.getScenarioPerformance();
  }

  @Get('managers')
  getManagers() {
    return this.analyticsService.getManagerPerformance();
  }

  @Get('sources')
  getSources() {
    return this.analyticsService.getSourcePerformance();
  }

  @Get('timeline')
  getTimeline(@Query('days') days = '30') {
    return this.analyticsService.getTimeline(Number(days));
  }

  @Get('lost-revenue')
  getLostRevenue() {
    return this.analyticsService.getLostRevenueAnalysis();
  }
}
