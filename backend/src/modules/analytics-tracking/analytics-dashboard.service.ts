import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalyticsTrackingService } from './analytics-tracking.service';

/**
 * Dashboard KPIs
 */
export interface DashboardKPI {
  visits: number;
  uniqueSessions: number;
  vinSearches: number;
  quotes: number;
  leads: number;
  deals: number;
  conversion: number;
}

/**
 * Source Performance
 */
export interface SourcePerformance {
  source: string;
  visits: number;
  leads: number;
  deals: number;
  revenue: number;
  profit: number;
  conversion: number;
  roi?: number;
}

/**
 * Analytics Dashboard Service
 * 
 * Provides aggregated analytics for admin dashboard
 */
@Injectable()
export class AnalyticsDashboardService {
  private readonly logger = new Logger(AnalyticsDashboardService.name);

  constructor(
    private readonly trackingService: AnalyticsTrackingService,
    @InjectModel('AnalyticsEvent') private analyticsModel: Model<any>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Deal') private dealModel: Model<any>,
    @InjectModel('Quote') private quoteModel: Model<any>,
  ) {}

  /**
   * Get full dashboard data
   */
  async getDashboard(days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [kpi, funnel, sources, timeline, fakeTraffic] = await Promise.all([
      this.getKPI(startDate),
      this.getFunnel(startDate),
      this.getSourcePerformance(startDate),
      this.trackingService.getTimeline(days),
      this.trackingService.getFakeTrafficCount(startDate),
    ]);

    return {
      kpi,
      funnel,
      sources,
      timeline,
      fakeTraffic: {
        count: fakeTraffic,
        percentage: kpi.visits > 0 ? ((fakeTraffic / (kpi.visits + fakeTraffic)) * 100).toFixed(1) : 0,
      },
      period: {
        days,
        startDate,
        endDate: new Date(),
      },
    };
  }

  /**
   * Get KPI metrics
   */
  async getKPI(startDate: Date): Promise<DashboardKPI> {
    const [visits, uniqueSessions, vinSearches, quotes, leads, deals] = await Promise.all([
      this.trackingService.countEvents('page_view', startDate),
      this.getUniqueSessions(startDate),
      this.trackingService.countEvents('vin_search', startDate),
      this.quoteModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.leadModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.dealModel.countDocuments({ createdAt: { $gte: startDate }, isDeleted: false }),
    ]);

    const conversion = visits > 0 ? (leads / visits) * 100 : 0;

    return {
      visits,
      uniqueSessions,
      vinSearches,
      quotes,
      leads,
      deals,
      conversion: parseFloat(conversion.toFixed(2)),
    };
  }

  /**
   * Get unique sessions count
   */
  private async getUniqueSessions(startDate: Date): Promise<number> {
    const result = await this.analyticsModel.aggregate([
      { $match: { isFake: false, createdAt: { $gte: startDate } } },
      { $group: { _id: '$sessionId' } },
      { $count: 'total' },
    ]);
    return result[0]?.total || 0;
  }

  /**
   * Get funnel data
   */
  async getFunnel(startDate: Date): Promise<any> {
    const [visits, vinSearches, quotes, leads, deals] = await Promise.all([
      this.trackingService.countEvents('page_view', startDate),
      this.trackingService.countEvents('vin_search', startDate),
      this.quoteModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.leadModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.dealModel.countDocuments({ createdAt: { $gte: startDate }, isDeleted: false }),
    ]);

    return {
      steps: [
        { name: 'Visits', value: visits, rate: 100 },
        { name: 'VIN Search', value: vinSearches, rate: visits > 0 ? ((vinSearches / visits) * 100).toFixed(1) : 0 },
        { name: 'Quotes', value: quotes, rate: visits > 0 ? ((quotes / visits) * 100).toFixed(1) : 0 },
        { name: 'Leads', value: leads, rate: visits > 0 ? ((leads / visits) * 100).toFixed(1) : 0 },
        { name: 'Deals', value: deals, rate: visits > 0 ? ((deals / visits) * 100).toFixed(1) : 0 },
      ],
    };
  }

  /**
   * Get source performance with revenue
   */
  async getSourcePerformance(startDate: Date): Promise<SourcePerformance[]> {
    // Get traffic by source
    const trafficBySource = await this.trackingService.getBySource(startDate);

    // Get leads and deals with source
    const leadsWithSource = await this.leadModel.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]);

    const dealsWithSource = await this.dealModel.aggregate([
      { $match: { createdAt: { $gte: startDate }, isDeleted: false } },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 },
          revenue: { $sum: '$realRevenue' },
          profit: { $sum: '$realProfit' },
        },
      },
    ]);

    // Merge data
    const sourceMap = new Map<string, SourcePerformance>();

    // Initialize from traffic
    trafficBySource.forEach(t => {
      sourceMap.set(t.source || 'direct', {
        source: t.source || 'direct',
        visits: t.visits,
        leads: 0,
        deals: 0,
        revenue: 0,
        profit: 0,
        conversion: 0,
      });
    });

    // Add leads
    leadsWithSource.forEach(l => {
      const source = l._id || 'direct';
      const existing = sourceMap.get(source) || {
        source,
        visits: 0,
        leads: 0,
        deals: 0,
        revenue: 0,
        profit: 0,
        conversion: 0,
      };
      existing.leads = l.count;
      sourceMap.set(source, existing);
    });

    // Add deals/revenue
    dealsWithSource.forEach(d => {
      const source = d._id || 'direct';
      const existing = sourceMap.get(source) || {
        source,
        visits: 0,
        leads: 0,
        deals: 0,
        revenue: 0,
        profit: 0,
        conversion: 0,
      };
      existing.deals = d.count;
      existing.revenue = d.revenue || 0;
      existing.profit = d.profit || 0;
      sourceMap.set(source, existing);
    });

    // Calculate conversion
    const results = Array.from(sourceMap.values()).map(s => ({
      ...s,
      conversion: s.visits > 0 ? parseFloat(((s.leads / s.visits) * 100).toFixed(2)) : 0,
    }));

    // Sort by visits
    return results.sort((a, b) => b.visits - a.visits);
  }

  /**
   * Get campaign performance
   */
  async getCampaignPerformance(startDate: Date): Promise<any[]> {
    return this.analyticsModel.aggregate([
      { $match: { isFake: false, createdAt: { $gte: startDate }, 'utm.campaign': { $exists: true } } },
      {
        $group: {
          _id: {
            source: '$utm.source',
            campaign: '$utm.campaign',
          },
          visits: { $sum: 1 },
          uniqueSessions: { $addToSet: '$sessionId' },
        },
      },
      {
        $project: {
          source: '$_id.source',
          campaign: '$_id.campaign',
          visits: 1,
          uniqueSessions: { $size: '$uniqueSessions' },
        },
      },
      { $sort: { visits: -1 } },
      { $limit: 50 },
    ]);
  }
}
