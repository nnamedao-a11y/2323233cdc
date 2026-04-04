import { Controller, Get, Post, Body, Query, Headers, Logger } from '@nestjs/common';
import { AnalyticsTrackingService, TrackEventDto } from './analytics-tracking.service';
import { AnalyticsDashboardService } from './analytics-dashboard.service';

/**
 * Analytics Controller
 * 
 * Endpoints for tracking and dashboard
 */
@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly trackingService: AnalyticsTrackingService,
    private readonly dashboardService: AnalyticsDashboardService,
  ) {}

  /**
   * Service status
   */
  @Get('status')
  async getStatus() {
    return {
      ok: true,
      service: 'analytics',
      version: '1.0.0',
      features: [
        'event_tracking',
        'source_attribution',
        'funnel_analysis',
        'fake_traffic_detection',
        'campaign_tracking',
      ],
    };
  }

  /**
   * Track event (lightweight, uses sendBeacon from frontend)
   * POST /api/analytics/track
   */
  @Post('track')
  async track(
    @Body() body: TrackEventDto,
    @Headers('user-agent') userAgent: string,
    @Headers('x-forwarded-for') forwardedFor: string,
  ) {
    const event: TrackEventDto = {
      ...body,
      userAgent: body.userAgent || userAgent,
      ip: forwardedFor?.split(',')[0]?.trim(),
    };

    this.trackingService.track(event);
    
    return { ok: true };
  }

  /**
   * Get full dashboard
   * GET /api/analytics/dashboard?days=30
   */
  @Get('dashboard')
  async getDashboard(@Query('days') days: string) {
    const daysNum = parseInt(days || '30', 10);
    const dashboard = await this.dashboardService.getDashboard(daysNum);
    
    return {
      success: true,
      data: dashboard,
    };
  }

  /**
   * Get KPI metrics only
   * GET /api/analytics/kpi?days=30
   */
  @Get('kpi')
  async getKPI(@Query('days') days: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days || '30', 10));
    
    const kpi = await this.dashboardService.getKPI(startDate);
    
    return {
      success: true,
      data: kpi,
    };
  }

  /**
   * Get funnel data
   * GET /api/analytics/funnel?days=30
   */
  @Get('funnel')
  async getFunnel(@Query('days') days: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days || '30', 10));
    
    const funnel = await this.dashboardService.getFunnel(startDate);
    
    return {
      success: true,
      data: funnel,
    };
  }

  /**
   * Get source performance
   * GET /api/analytics/sources?days=30
   */
  @Get('sources')
  async getSources(@Query('days') days: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days || '30', 10));
    
    const sources = await this.dashboardService.getSourcePerformance(startDate);
    
    return {
      success: true,
      data: sources,
    };
  }

  /**
   * Get timeline data
   * GET /api/analytics/timeline?days=30&event=page_view
   */
  @Get('timeline')
  async getTimeline(
    @Query('days') days: string,
    @Query('event') event: string,
  ) {
    const daysNum = parseInt(days || '30', 10);
    const timeline = await this.trackingService.getTimeline(daysNum, event);
    
    return {
      success: true,
      data: timeline,
    };
  }

  /**
   * Get campaign performance
   * GET /api/analytics/campaigns?days=30
   */
  @Get('campaigns')
  async getCampaigns(@Query('days') days: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days || '30', 10));
    
    const campaigns = await this.dashboardService.getCampaignPerformance(startDate);
    
    return {
      success: true,
      data: campaigns,
    };
  }

  /**
   * Link session to customer (call when user logs in)
   * POST /api/analytics/link-session
   */
  @Post('link-session')
  async linkSession(@Body() body: { sessionId: string; customerId: string }) {
    await this.trackingService.linkSessionToCustomer(body.sessionId, body.customerId);
    return { ok: true };
  }
}
