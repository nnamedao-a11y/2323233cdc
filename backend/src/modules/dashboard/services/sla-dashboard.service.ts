import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../../leads/lead.schema';
import { Task } from '../../tasks/task.schema';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { SlaDashboardMetrics } from '../interfaces/dashboard-response.interface';

@Injectable()
export class SlaDashboardService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
  ) {}

  async getMetrics(query: DashboardQueryDto): Promise<SlaDashboardMetrics> {
    const periodStart = this.getPeriodStart(query.period);
    const now = new Date();

    const [
      overdueLeads,
      overdueTasks,
      overdueCallbacks,
      avgFirstResponse,
      missedSlaStats,
    ] = await Promise.all([
      this.getOverdueLeads(query),
      this.getOverdueTasks(query),
      this.getOverdueCallbacks(query),
      this.getAvgFirstResponseMinutes(periodStart),
      this.getMissedSlaRate(periodStart),
    ]);

    return {
      overdueLeads,
      overdueTasks,
      overdueCallbacks,
      avgFirstResponseMinutes: avgFirstResponse,
      missedSlaRate: missedSlaStats,
    };
  }

  private async getOverdueLeads(query: DashboardQueryDto): Promise<number> {
    const filter: any = {
      assignedTo: { $exists: true, $ne: null },
      firstResponseDueAt: { $lt: new Date() },
      firstResponseAt: { $exists: false },
      isDeleted: { $ne: true },
      status: { $nin: ['won', 'lost', 'archived'] },
    };

    if (query.managerId) {
      filter.assignedTo = query.managerId;
    }

    return this.leadModel.countDocuments(filter);
  }

  private async getOverdueTasks(query: DashboardQueryDto): Promise<number> {
    const filter: any = {
      dueDate: { $lt: new Date() },
      status: { $in: ['todo', 'in_progress'] },
      isDeleted: { $ne: true },
    };

    if (query.managerId) {
      filter.assignedTo = query.managerId;
    }

    return this.taskModel.countDocuments(filter);
  }

  private async getOverdueCallbacks(query: DashboardQueryDto): Promise<number> {
    const filter: any = {
      nextFollowUpAt: { $lt: new Date() },
      status: { $nin: ['won', 'lost', 'archived'] },
      isDeleted: { $ne: true },
    };

    if (query.managerId) {
      filter.assignedTo = query.managerId;
    }

    return this.leadModel.countDocuments(filter);
  }

  private async getAvgFirstResponseMinutes(periodStart: Date): Promise<number> {
    const result = await this.leadModel.aggregate([
      {
        $match: {
          firstResponseAt: { $exists: true, $gte: periodStart },
          assignedAt: { $exists: true },
          isDeleted: { $ne: true },
        },
      },
      {
        $project: {
          responseTimeMs: {
            $subtract: ['$firstResponseAt', '$assignedAt'],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgResponseMs: { $avg: '$responseTimeMs' },
        },
      },
    ]);

    if (result.length === 0 || !result[0].avgResponseMs) {
      return 0;
    }

    // Convert ms to minutes
    return Math.round(result[0].avgResponseMs / 60000);
  }

  private async getMissedSlaRate(periodStart: Date): Promise<number> {
    const [totalWithSla, missedSla] = await Promise.all([
      this.leadModel.countDocuments({
        firstResponseDueAt: { $exists: true },
        createdAt: { $gte: periodStart },
        isDeleted: { $ne: true },
      }),
      this.leadModel.countDocuments({
        isOverdueForFirstResponse: true,
        createdAt: { $gte: periodStart },
        isDeleted: { $ne: true },
      }),
    ]);

    if (totalWithSla === 0) return 0;
    return Math.round((missedSla / totalWithSla) * 100);
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
