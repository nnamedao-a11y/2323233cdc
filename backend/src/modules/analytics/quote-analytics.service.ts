/**
 * Quote Analytics Service
 * 
 * Надає агреговану аналітику по quotes:
 * - Overview metrics
 * - Scenario performance
 * - Manager performance with margin/override tracking
 * - Source performance
 * - Timeline data
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Quote, QuoteDocument } from '../calculator/schemas/quote.schema';
import { Lead } from '../leads/lead.schema';
import { Model } from 'mongoose';

@Injectable()
export class QuoteAnalyticsService {
  constructor(
    @InjectModel(Quote.name)
    private readonly quoteModel: Model<QuoteDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<any>,
  ) {}

  async getOverview() {
    const [quoteStats] = await this.quoteModel.aggregate([
      {
        $group: {
          _id: null,
          totalQuotes: { $sum: 1 },
          avgVisibleTotal: { $avg: '$visibleTotal' },
          avgInternalTotal: { $avg: '$internalTotal' },
          totalVisibleRevenue: { $sum: '$visibleTotal' },
          totalInternalRevenue: { $sum: '$internalTotal' },
          totalHiddenFee: { $sum: '$hiddenFee' },
          convertedQuotes: {
            $sum: {
              $cond: ['$convertedToLead', 1, 0],
            },
          },
        },
      },
    ]);

    const totalQuotes = quoteStats?.totalQuotes || 0;
    const convertedQuotes = quoteStats?.convertedQuotes || 0;

    const conversionRate =
      totalQuotes > 0 ? convertedQuotes / totalQuotes : 0;

    return {
      totalQuotes,
      avgVisibleTotal: this.round2(quoteStats?.avgVisibleTotal || 0),
      avgInternalTotal: this.round2(quoteStats?.avgInternalTotal || 0),
      totalVisibleRevenue: this.round2(quoteStats?.totalVisibleRevenue || 0),
      totalInternalRevenue: this.round2(quoteStats?.totalInternalRevenue || 0),
      totalHiddenFee: this.round2(quoteStats?.totalHiddenFee || 0),
      convertedQuotes,
      conversionRate: this.round2(conversionRate * 100),
      estimatedMargin: this.round2(
        (quoteStats?.totalInternalRevenue || 0) -
          (quoteStats?.totalVisibleRevenue || 0),
      ),
    };
  }

  async getScenarioPerformance() {
    const scenarios = await this.quoteModel.aggregate([
      {
        $group: {
          _id: '$selectedScenario',
          count: { $sum: 1 },
          avgVisibleTotal: { $avg: '$visibleTotal' },
          avgInternalTotal: { $avg: '$internalTotal' },
          avgHiddenFee: { $avg: '$hiddenFee' },
          convertedCount: {
            $sum: {
              $cond: ['$convertedToLead', 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          scenario: { $ifNull: ['$_id', 'recommended'] },
          count: 1,
          avgVisibleTotal: { $round: ['$avgVisibleTotal', 2] },
          avgInternalTotal: { $round: ['$avgInternalTotal', 2] },
          avgHiddenFee: { $round: ['$avgHiddenFee', 2] },
          convertedCount: 1,
          conversionRate: {
            $cond: [
              { $gt: ['$count', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$convertedCount', '$count'] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return scenarios;
  }

  async getManagerPerformance() {
    // Get all quotes with manager info
    const managers = await this.quoteModel.aggregate([
      {
        $match: {
          managerId: { $exists: true, $ne: null },
        },
      },
      {
        $addFields: {
          marginValue: {
            $subtract: ['$internalTotal', '$visibleTotal'],
          },
          // Check if there's override in history
          hasOverride: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: ['$history', []] },
                    as: 'h',
                    cond: { $eq: ['$$h.action', 'PRICE_OVERRIDE'] },
                  },
                },
              },
              0,
            ],
          },
          // Calculate override delta from history
          overrideDelta: {
            $let: {
              vars: {
                overrideEntry: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: { $ifNull: ['$history', []] },
                        as: 'h',
                        cond: { $eq: ['$$h.action', 'PRICE_OVERRIDE'] },
                      },
                    },
                    -1,
                  ],
                },
              },
              in: {
                $cond: [
                  { $ifNull: ['$$overrideEntry', false] },
                  {
                    $subtract: [
                      { $ifNull: ['$$overrideEntry.oldValue.visibleTotal', '$visibleTotal'] },
                      { $ifNull: ['$finalPrice', '$visibleTotal'] },
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$managerId',
          totalQuotes: { $sum: 1 },
          convertedQuotes: {
            $sum: {
              $cond: ['$convertedToLead', 1, 0],
            },
          },
          avgVisibleTotal: { $avg: '$visibleTotal' },
          avgInternalTotal: { $avg: '$internalTotal' },
          avgMargin: { $avg: '$marginValue' },
          totalMargin: { $sum: '$marginValue' },
          overridesCount: {
            $sum: {
              $cond: ['$hasOverride', 1, 0],
            },
          },
          revenueLostByOverride: { $sum: '$overrideDelta' },
        },
      },
      {
        $project: {
          _id: 0,
          managerId: { $toString: '$_id' },
          totalQuotes: 1,
          convertedQuotes: 1,
          conversionRate: {
            $cond: [
              { $gt: ['$totalQuotes', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$convertedQuotes', '$totalQuotes'] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          avgVisibleTotal: { $round: ['$avgVisibleTotal', 2] },
          avgInternalTotal: { $round: ['$avgInternalTotal', 2] },
          avgMargin: { $round: ['$avgMargin', 2] },
          totalMargin: { $round: ['$totalMargin', 2] },
          overridesCount: 1,
          overrideRate: {
            $cond: [
              { $gt: ['$totalQuotes', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$overridesCount', '$totalQuotes'] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          revenueLostByOverride: { $round: ['$revenueLostByOverride', 2] },
        },
      },
      { $sort: { totalQuotes: -1 } },
    ]);

    // Lookup manager names
    const User = this.quoteModel.db.model('User');
    const managersWithNames = await Promise.all(
      managers.map(async (m) => {
        try {
          const user: any = await User.findById(m.managerId).select('firstName lastName email').lean();
          return {
            ...m,
            managerName: user ? `${user.firstName} ${user.lastName}` : m.managerId,
            managerEmail: user?.email || '',
          };
        } catch {
          return { ...m, managerName: m.managerId, managerEmail: '' };
        }
      }),
    );

    return managersWithNames;
  }

  async getSourcePerformance() {
    return this.quoteModel.aggregate([
      {
        $group: {
          _id: '$createdFrom',
          totalQuotes: { $sum: 1 },
          convertedQuotes: {
            $sum: {
              $cond: ['$convertedToLead', 1, 0],
            },
          },
          totalVisibleRevenue: { $sum: '$visibleTotal' },
          totalInternalRevenue: { $sum: '$internalTotal' },
          avgHiddenFee: { $avg: '$hiddenFee' },
        },
      },
      {
        $project: {
          _id: 0,
          source: { $ifNull: ['$_id', 'unknown'] },
          totalQuotes: 1,
          convertedQuotes: 1,
          conversionRate: {
            $cond: [
              { $gt: ['$totalQuotes', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$convertedQuotes', '$totalQuotes'] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          totalVisibleRevenue: { $round: ['$totalVisibleRevenue', 2] },
          totalInternalRevenue: { $round: ['$totalInternalRevenue', 2] },
          avgHiddenFee: { $round: ['$avgHiddenFee', 2] },
          estimatedMargin: {
            $round: [
              {
                $subtract: ['$totalInternalRevenue', '$totalVisibleRevenue'],
              },
              2,
            ],
          },
        },
      },
      { $sort: { totalQuotes: -1 } },
    ]);
  }

  async getTimeline(days = 30) {
    const start = new Date();
    start.setDate(start.getDate() - days);

    return this.quoteModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          totalQuotes: { $sum: 1 },
          convertedQuotes: {
            $sum: {
              $cond: ['$convertedToLead', 1, 0],
            },
          },
          totalVisibleRevenue: { $sum: '$visibleTotal' },
          totalMargin: { $sum: { $subtract: ['$internalTotal', '$visibleTotal'] } },
        },
      },
      {
        $project: {
          _id: 0,
          date: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              {
                $cond: [
                  { $lt: ['$_id.month', 10] },
                  { $concat: ['0', { $toString: '$_id.month' }] },
                  { $toString: '$_id.month' },
                ],
              },
              '-',
              {
                $cond: [
                  { $lt: ['$_id.day', 10] },
                  { $concat: ['0', { $toString: '$_id.day' }] },
                  { $toString: '$_id.day' },
                ],
              },
            ],
          },
          totalQuotes: 1,
          convertedQuotes: 1,
          totalVisibleRevenue: { $round: ['$totalVisibleRevenue', 2] },
          totalMargin: { $round: ['$totalMargin', 2] },
        },
      },
      { $sort: { date: 1 } },
    ]);
  }

  async getLostRevenueAnalysis() {
    // Get quotes with price overrides
    const overriddenQuotes = await this.quoteModel.aggregate([
      {
        $match: {
          'history.action': 'PRICE_OVERRIDE',
        },
      },
      {
        $addFields: {
          overrideEntry: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$history',
                  as: 'h',
                  cond: { $eq: ['$$h.action', 'PRICE_OVERRIDE'] },
                },
              },
              -1,
            ],
          },
        },
      },
      {
        $project: {
          quoteNumber: 1,
          vin: 1,
          vehicleTitle: 1,
          originalPrice: '$overrideEntry.oldValue.visibleTotal',
          overridePrice: '$finalPrice',
          delta: {
            $subtract: [
              '$overrideEntry.oldValue.visibleTotal',
              { $ifNull: ['$finalPrice', '$visibleTotal'] },
            ],
          },
          overrideReason: '$overrideEntry.newValue.reason',
          overrideAt: '$overrideEntry.timestamp',
          managerId: 1,
        },
      },
      {
        $match: {
          delta: { $gt: 0 },
        },
      },
      { $sort: { delta: -1 } },
      { $limit: 50 },
    ]);

    const totalLost = overriddenQuotes.reduce((sum, q) => sum + (q.delta || 0), 0);

    return {
      totalLostRevenue: this.round2(totalLost),
      overridesCount: overriddenQuotes.length,
      topLosses: overriddenQuotes.slice(0, 10),
    };
  }

  async getFullDashboard() {
    const [overview, scenarios, managers, sources, timeline, lostRevenue] =
      await Promise.all([
        this.getOverview(),
        this.getScenarioPerformance(),
        this.getManagerPerformance(),
        this.getSourcePerformance(),
        this.getTimeline(),
        this.getLostRevenueAnalysis(),
      ]);

    return {
      overview,
      scenarios,
      managers,
      sources,
      timeline,
      lostRevenue,
    };
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
