import { Controller, Get, Post, Body, Query, Logger, Param, Patch } from '@nestjs/common';
import { FacebookConversionService } from './facebook-conversion.service';
import { AutoBudgetOptimizerService, CampaignMetrics } from './auto-budget-optimizer.service';
import { MarketingPerformanceService } from './marketing-performance.service';
import { MetaAdsService } from './meta-ads.service';
import { AutoActionService, AutoModeConfig } from './auto-action.service';

/**
 * Marketing Controller
 * 
 * API for marketing automation and optimization
 */
@Controller('marketing')
export class MarketingController {
  private readonly logger = new Logger(MarketingController.name);

  constructor(
    private readonly facebookService: FacebookConversionService,
    private readonly optimizer: AutoBudgetOptimizerService,
    private readonly performance: MarketingPerformanceService,
    private readonly metaAds: MetaAdsService,
    private readonly autoAction: AutoActionService,
  ) {}

  /**
   * Service status
   */
  @Get('status')
  async getStatus() {
    const config = this.autoAction.getConfig();
    const todayActions = await this.autoAction.getTodayActionCount();
    
    return {
      ok: true,
      service: 'marketing',
      version: '2.0.0',
      features: [
        'facebook_conversion_api',
        'auto_budget_optimizer',
        'campaign_performance',
        'source_attribution',
        'meta_ads_spend_sync',
        'auto_actions',
      ],
      facebookCapi: {
        configured: this.facebookService.isConfigured(),
        pixelId: process.env.FB_PIXEL_ID ? '***configured***' : 'not set',
      },
      metaAds: {
        configured: this.metaAds.isConfigured,
        accountId: process.env.META_AD_ACCOUNT_ID ? '***configured***' : 'not set',
      },
      autoMode: {
        enabled: config.enabled,
        todayActions,
        maxActionsPerDay: config.maxActionsPerDay,
      },
    };
  }

  /**
   * Get campaign performance with optimization decisions
   * GET /api/marketing/campaigns?days=30
   */
  @Get('campaigns')
  async getCampaigns(@Query('days') days: string) {
    const daysNum = parseInt(days || '30', 10);
    const result = await this.performance.getCampaignPerformance(daysNum);
    
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Get source-level summary
   * GET /api/marketing/sources?days=30
   */
  @Get('sources')
  async getSources(@Query('days') days: string) {
    const daysNum = parseInt(days || '30', 10);
    const sources = await this.performance.getSourceSummary(daysNum);
    
    return {
      success: true,
      data: sources,
    };
  }

  /**
   * Evaluate campaigns with spend data
   * POST /api/marketing/optimize
   */
  @Post('optimize')
  async optimize(@Body() body: {
    campaigns: CampaignMetrics[];
    spendData?: { campaign: string; spend: number }[];
  }) {
    // If raw campaign data provided, evaluate directly
    if (body.campaigns && body.campaigns.length > 0) {
      const decisions = this.optimizer.evaluateAll(body.campaigns);
      const summary = this.optimizer.getSummary(decisions);
      
      return {
        success: true,
        data: { decisions, summary },
      };
    }

    // Otherwise, get from database
    const result = await this.performance.getCampaignPerformance(30, body.spendData);
    
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Manually send Facebook event (for testing)
   * POST /api/marketing/fb-event
   */
  @Post('fb-event')
  async sendFacebookEvent(@Body() body: {
    eventType: 'lead' | 'quote' | 'purchase' | 'search' | 'view';
    data: any;
  }) {
    if (!this.facebookService.isConfigured()) {
      return {
        success: false,
        error: 'Facebook CAPI not configured. Set FB_PIXEL_ID and FB_ACCESS_TOKEN.',
      };
    }

    let result = false;

    switch (body.eventType) {
      case 'lead':
        result = await this.facebookService.trackLead(body.data);
        break;
      case 'quote':
        result = await this.facebookService.trackQuote(body.data);
        break;
      case 'purchase':
        result = await this.facebookService.trackPurchase(body.data);
        break;
      case 'search':
        result = await this.facebookService.trackSearch(body.data);
        break;
      case 'view':
        result = await this.facebookService.trackViewContent(body.data);
        break;
    }

    return {
      success: result,
      message: result ? 'Event sent to Facebook' : 'Failed to send event',
    };
  }

  /**
   * Get optimization recommendations
   * GET /api/marketing/recommendations?days=30
   */
  @Get('recommendations')
  async getRecommendations(@Query('days') days: string) {
    const daysNum = parseInt(days || '30', 10);
    const result = await this.performance.getCampaignPerformance(daysNum);
    
    const { summary, decisions } = result;

    // Build actionable recommendations
    const scaleCampaigns = decisions.filter(d => d.status === 'scale');
    const killCampaigns = decisions.filter(d => d.status === 'kill');
    const watchCampaigns = decisions.filter(d => d.status === 'watch');

    const recommendations: Array<{
      priority: string;
      action: string;
      campaign: string;
      source: string;
      message: string;
      suggestion: string;
    }> = [];

    // Scale recommendations
    scaleCampaigns.forEach(c => {
      recommendations.push({
        priority: 'high',
        action: 'scale',
        campaign: c.campaign,
        source: c.source,
        message: `Scale "${c.campaign}" - ROI ${c.roi}%, ${c.deals} deals`,
        suggestion: 'Increase budget by 15-20%',
      });
    });

    // Kill recommendations
    killCampaigns.forEach(c => {
      recommendations.push({
        priority: 'urgent',
        action: 'kill',
        campaign: c.campaign,
        source: c.source,
        message: `Stop "${c.campaign}" - wasting $${c.spend}`,
        suggestion: c.reasons.join(', '),
      });
    });

    // Watch recommendations
    watchCampaigns.slice(0, 5).forEach(c => {
      recommendations.push({
        priority: 'medium',
        action: 'watch',
        campaign: c.campaign,
        source: c.source,
        message: `Monitor "${c.campaign}"`,
        suggestion: c.actions.join(', '),
      });
    });

    return {
      success: true,
      data: {
        summary,
        recommendations: recommendations.sort((a, b) => {
          const order = { urgent: 0, high: 1, medium: 2, low: 3 };
          return (order[a.priority as keyof typeof order] || 3) - (order[b.priority as keyof typeof order] || 3);
        }),
      },
    };
  }

  // ==========================================
  // META ADS API ENDPOINTS
  // ==========================================

  /**
   * Get campaign spend data from Meta Ads
   * GET /api/marketing/spend
   */
  @Get('spend')
  async getSpendData() {
    if (!this.metaAds.isConfigured) {
      return {
        success: false,
        error: 'Meta Ads API not configured. Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID.',
        data: [],
      };
    }

    const spend = await this.autoAction.getSpendData();
    
    return {
      success: true,
      data: spend,
    };
  }

  /**
   * Manually sync spend data
   * POST /api/marketing/spend/sync
   */
  @Post('spend/sync')
  async syncSpendData() {
    if (!this.metaAds.isConfigured) {
      return {
        success: false,
        error: 'Meta Ads API not configured',
      };
    }

    await this.autoAction.syncSpendData();
    const spend = await this.autoAction.getSpendData();
    
    return {
      success: true,
      message: 'Spend data synced',
      data: spend,
    };
  }

  /**
   * Get Meta Ads campaign insights directly
   * GET /api/marketing/meta/insights?days=7
   */
  @Get('meta/insights')
  async getMetaInsights(@Query('days') days: string) {
    if (!this.metaAds.isConfigured) {
      return {
        success: false,
        error: 'Meta Ads API not configured',
        data: [],
      };
    }

    const daysNum = parseInt(days || '7', 10);
    const insights = await this.metaAds.getCampaignInsights(daysNum);
    
    return {
      success: true,
      data: insights,
    };
  }

  // ==========================================
  // AUTO ACTION ENDPOINTS
  // ==========================================

  /**
   * Get auto mode configuration
   * GET /api/marketing/auto/config
   */
  @Get('auto/config')
  async getAutoConfig() {
    const config = this.autoAction.getConfig();
    const todayActions = await this.autoAction.getTodayActionCount();
    
    return {
      success: true,
      data: {
        ...config,
        todayActions,
        actionsRemaining: Math.max(0, config.maxActionsPerDay - todayActions),
      },
    };
  }

  /**
   * Update auto mode configuration
   * PATCH /api/marketing/auto/config
   */
  @Patch('auto/config')
  async updateAutoConfig(@Body() body: {
    enabled?: boolean;
    maxActionsPerDay?: number;
    maxBudgetChangePercent?: number;
    minSpendForDecision?: number;
    minDataDays?: number;
  }) {
    const config = this.autoAction.updateConfig(body);
    
    return {
      success: true,
      message: 'Configuration updated',
      data: config,
    };
  }

  /**
   * Get action history
   * GET /api/marketing/auto/history?days=30
   */
  @Get('auto/history')
  async getActionHistory(@Query('days') days: string) {
    const daysNum = parseInt(days || '30', 10);
    const history = await this.autoAction.getActionHistory(daysNum);
    
    return {
      success: true,
      data: history,
    };
  }

  /**
   * Get decision log (why system made each decision)
   * GET /api/marketing/auto/decisions?limit=100
   */
  @Get('auto/decisions')
  async getDecisionLog(@Query('limit') limit: string) {
    const limitNum = Math.min(parseInt(limit || '100', 10), 500);
    const log = this.autoAction.getDecisionLog(limitNum);
    
    return {
      success: true,
      count: log.length,
      data: log,
    };
  }

  /**
   * Execute action manually
   * POST /api/marketing/auto/execute
   */
  @Post('auto/execute')
  async executeAction(@Body() body: {
    campaign: string;
    campaignId?: string;
    status: 'scale' | 'kill' | 'watch';
    roi?: number;
    profit?: number;
    source?: string;
    leads?: number;
    deals?: number;
    spend?: number;
  }) {
    // Build decision object
    const decision = {
      campaign: body.campaign,
      source: body.source || 'manual',
      leads: body.leads || 0,
      deals: body.deals || 0,
      profit: body.profit || 0,
      spend: body.spend || 0,
      roi: body.roi || 0,
      status: body.status,
      reasons: ['Manual action'],
      actions: [`Manual ${body.status} action`],
    };

    const result = await this.autoAction.executeAction(decision, false);
    
    return {
      success: result.success,
      message: result.success ? 'Action executed' : 'Action failed',
      data: result.action,
    };
  }

  /**
   * Get campaigns with ROI (spend + profit data combined)
   * GET /api/marketing/roi?days=30
   */
  @Get('roi')
  async getCampaignsWithROI(@Query('days') days: string) {
    const daysNum = parseInt(days || '30', 10);
    
    // Get spend data
    const spendData = await this.autoAction.getSpendData();
    const spendMap = new Map(spendData.map(s => [s.campaign, s]));

    // Get performance data
    const perfResult = await this.performance.getCampaignPerformance(daysNum);
    
    // Merge with real spend data
    const enrichedDecisions = perfResult.decisions.map(d => {
      const spendRecord = spendMap.get(d.campaign);
      const realSpend = spendRecord?.spend || d.spend || 0;
      const realROI = realSpend > 0 ? ((d.profit - realSpend) / realSpend) * 100 : 0;
      
      return {
        ...d,
        spend: realSpend,
        roi: Math.round(realROI * 10) / 10,
        metaData: spendRecord ? {
          clicks: spendRecord.clicks,
          impressions: spendRecord.impressions,
          cpc: spendRecord.cpc,
          ctr: spendRecord.ctr,
          lastSync: spendRecord.syncedAt,
        } : null,
      };
    });

    return {
      success: true,
      data: {
        decisions: enrichedDecisions,
        summary: {
          ...perfResult.summary,
          totalSpend: spendData.reduce((sum, s) => sum + s.spend, 0),
        },
      },
    };
  }
}
