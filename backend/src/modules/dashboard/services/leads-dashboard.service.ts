import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../../leads/lead.schema';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { LeadsDashboardMetrics } from '../interfaces/dashboard-response.interface';
import { LEAD_STATUS_GROUPS } from '../constants/dashboard-cache.constants';

@Injectable()
export class LeadsDashboardService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
  ) {}

  async getMetrics(query: DashboardQueryDto): Promise<LeadsDashboardMetrics> {
    const periodStart = this.getPeriodStart(query.period);

    const baseFilter: any = {
      isDeleted: { $ne: true },
    };

    if (query.managerId) {
      baseFilter.assignedTo = query.managerId;
    }

    // Aggregate by status
    const statusAggregation = await this.leadModel.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Build status counts map
    const statusCounts = statusAggregation.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);

    // Calculate grouped counts
    const newCount = LEAD_STATUS_GROUPS.new.reduce(
      (sum, status) => sum + (statusCounts[status] || 0),
      0,
    );

    const inProgressCount = LEAD_STATUS_GROUPS.inProgress.reduce(
      (sum, status) => sum + (statusCounts[status] || 0),
      0,
    );

    const convertedCount = LEAD_STATUS_GROUPS.converted.reduce(
      (sum, status) => sum + (statusCounts[status] || 0),
      0,
    );

    const lostCount = LEAD_STATUS_GROUPS.lost.reduce(
      (sum, status) => sum + (statusCounts[status] || 0),
      0,
    );

    // Unassigned leads (subset of new/inProgress that have no manager)
    const unassignedCount = await this.leadModel.countDocuments({
      ...baseFilter,
      $or: [
        { assignedTo: { $exists: false } },
        { assignedTo: null },
        { assignedTo: '' },
      ],
      status: { $nin: ['won', 'lost', 'archived'] },
    });

    // Total active = new + in_progress (leads that need attention)
    // Note: unassignedCount is a SUBSET of totalActive (unassigned from new/inProgress)
    const totalActive = newCount + inProgressCount;

    return {
      newCount,
      inProgressCount,
      convertedCount,
      lostCount,
      unassignedCount,
      totalActive,
    };
  }

  private getPeriodStart(period: string = 'day'): Date {
    const now = new Date();
    switch (period) {
      case 'week':
        return new Date(now.setDate(now.getDate() - 7));
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1));
      default:
        return new Date(now.setHours(0, 0, 0, 0));
    }
  }
}
