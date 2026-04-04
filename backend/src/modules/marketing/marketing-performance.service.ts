import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AutoBudgetOptimizerService, CampaignMetrics, CampaignDecision } from './auto-budget-optimizer.service';

/**
 * Marketing Performance Service
 * 
 * Aggregates data from analytics, leads, deals to build
 * comprehensive campaign performance metrics
 */
@Injectable()
export class MarketingPerformanceService {
  private readonly logger = new Logger(MarketingPerformanceService.name);

  constructor(
    private readonly optimizer: AutoBudgetOptimizerService,
    @InjectModel('AnalyticsEvent') private analyticsModel: Model<any>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Quote') private quoteModel: Model<any>,
  ) {}

  /**
   * Get campaign performance with auto-optimization decisions
   */
  async getCampaignPerformance(
    days: number = 30,
    spendData?: { campaign: string; spend: number }[],
  ): Promise<{
    decisions: CampaignDecision[];
    summary: any;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all campaigns from analytics
    const campaigns = await this.aggregateCampaignData(startDate);

    // Merge with spend data if provided
    if (spendData) {
      const spendMap = new Map(spendData.map(s => [s.campaign, s.spend]));
      campaigns.forEach(c => {
        if (spendMap.has(c.campaign)) {
          c.spend = spendMap.get(c.campaign)!;
        }
      });
    }

    // Evaluate all campaigns
    const decisions = this.optimizer.evaluateAll(campaigns);
    const summary = this.optimizer.getSummary(decisions);

    return { decisions, summary };
  }

  /**
   * Aggregate campaign data from all sources
   */
  private async aggregateCampaignData(startDate: Date): Promise<CampaignMetrics[]> {
    // Get visits by source/campaign
    const visits = await this.analyticsModel.aggregate([
      { $match: { isFake: false, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            source: { $ifNull: ['$utm.source', 'direct'] },
            campaign: { $ifNull: ['$utm.campaign', 'none'] },
          },
          visits: { $sum: 1 },
          fakeCount: { $sum: { $cond: ['$isFake', 1, 0] } },
        },
      },
    ]);

    // Get VIN searches by source
    const vinSearches = await this.analyticsModel.aggregate([
      { $match: { event: 'vin_search', createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            source: { $ifNull: ['$utm.source', 'direct'] },
            campaign: { $ifNull: ['$utm.campaign', 'none'] },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get leads by source
    const leads = await this.leadModel.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $ifNull: ['$source', 'direct'] },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get quotes by source
    const quotes = await this.quoteModel.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $ifNull: ['$source', 'direct'] },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get deals with revenue by source
    const deals = await this.dealModel.aggregate([
      { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
      {
        $group: {
          _id: { $ifNull: ['$source', 'direct'] },
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$realRevenue', 0] } },
          profit: { $sum: { $ifNull: ['$realProfit', 0] } },
        },
      },
    ]);

    // Build campaign map
    const campaignMap = new Map<string, CampaignMetrics>();

    // Add visits data
    visits.forEach((v: any) => {
      const key = `${v._id.source}__${v._id.campaign}`;
      const totalWithFake = v.visits + (v.fakeCount || 0);
      
      campaignMap.set(key, {
        source: v._id.source,
        campaign: v._id.campaign,
        spend: 0, // Will be filled from external data
        visits: v.visits,
        leads: 0,
        deals: 0,
        revenue: 0,
        profit: 0,
        fakeTrafficRate: totalWithFake > 0 ? (v.fakeCount / totalWithFake) * 100 : 0,
        vinSearches: 0,
        quotes: 0,
      });
    });

    // Add VIN searches
    vinSearches.forEach((v: any) => {
      const key = `${v._id.source}__${v._id.campaign}`;
      const existing = campaignMap.get(key);
      if (existing) {
        existing.vinSearches = v.count;
      }
    });

    // Add leads (by source only for now)
    leads.forEach((l: any) => {
      // Find all campaigns with this source and distribute leads
      for (const [key, metrics] of campaignMap) {
        if (metrics.source === l._id) {
          metrics.leads += l.count;
          break; // Simple attribution to first campaign
        }
      }
    });

    // Add quotes
    quotes.forEach((q: any) => {
      for (const [key, metrics] of campaignMap) {
        if (metrics.source === q._id) {
          metrics.quotes = (metrics.quotes || 0) + q.count;
          break;
        }
      }
    });

    // Add deals/revenue
    deals.forEach((d: any) => {
      for (const [key, metrics] of campaignMap) {
        if (metrics.source === d._id) {
          metrics.deals += d.count;
          metrics.revenue += d.revenue;
          metrics.profit += d.profit;
          break;
        }
      }
    });

    return Array.from(campaignMap.values());
  }

  /**
   * Get source-level summary (simplified)
   */
  async getSourceSummary(days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.getCampaignPerformance(days);
    
    // Group by source
    const sourceMap = new Map<string, any>();
    
    result.decisions.forEach(d => {
      const existing = sourceMap.get(d.source) || {
        source: d.source,
        campaigns: 0,
        visits: 0,
        leads: 0,
        deals: 0,
        revenue: 0,
        profit: 0,
        spend: 0,
        scaleCount: 0,
        killCount: 0,
      };

      existing.campaigns++;
      existing.visits += d.visits;
      existing.leads += d.leads;
      existing.deals += d.deals;
      existing.revenue += d.revenue;
      existing.profit += d.profit;
      existing.spend += d.spend;
      if (d.status === 'scale') existing.scaleCount++;
      if (d.status === 'kill') existing.killCount++;

      sourceMap.set(d.source, existing);
    });

    return Array.from(sourceMap.values()).map(s => ({
      ...s,
      roi: s.spend > 0 ? ((s.profit - s.spend) / s.spend) * 100 : 0,
      cpl: s.leads > 0 ? s.spend / s.leads : 0,
    }));
  }
}
