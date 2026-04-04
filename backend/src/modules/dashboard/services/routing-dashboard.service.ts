import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../../leads/lead.schema';
import { AssignmentHistory } from '../../lead-routing/schemas/assignment-history.schema';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { RoutingDashboardMetrics } from '../interfaces/dashboard-response.interface';
import { AssignmentStrategy } from '../../lead-routing/enums/assignment.enum';

@Injectable()
export class RoutingDashboardService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(AssignmentHistory.name) private assignmentHistoryModel: Model<AssignmentHistory>,
  ) {}

  async getMetrics(query: DashboardQueryDto): Promise<RoutingDashboardMetrics> {
    const periodStart = this.getPeriodStart(query.period);

    const [
      fallbackAssignments,
      totalAssignments,
      reassignedLeads,
      avgAssignmentTime,
      unassignedLeads,
      workloadMetrics,
    ] = await Promise.all([
      // Fallback assignments in period
      this.assignmentHistoryModel.countDocuments({
        strategy: AssignmentStrategy.FALLBACK,
        createdAt: { $gte: periodStart },
      }),

      // Total assignments in period
      this.assignmentHistoryModel.countDocuments({
        createdAt: { $gte: periodStart },
      }),

      // Reassigned leads (leads with reassignedCount > 0)
      this.leadModel.countDocuments({
        reassignedCount: { $gt: 0 },
        createdAt: { $gte: periodStart },
        isDeleted: { $ne: true },
      }),

      // Average assignment time (from lead creation to assignment)
      this.getAverageAssignmentTime(periodStart),

      // Unassigned leads
      this.leadModel.countDocuments({
        $or: [
          { assignedTo: { $exists: false } },
          { assignedTo: null },
          { assignedTo: '' },
        ],
        status: { $nin: ['won', 'lost', 'archived'] },
        isDeleted: { $ne: true },
      }),

      // Overloaded queue risk calculation
      this.calculateOverloadedQueueRisk(),
    ]);

    // Calculate reassignment rate
    const reassignmentRate = totalAssignments > 0
      ? Math.round((reassignedLeads / totalAssignments) * 100)
      : 0;

    return {
      fallbackAssignments,
      reassignmentRate,
      averageAssignmentTimeSec: avgAssignmentTime,
      unassignedLeads,
      overloadedQueueRisk: workloadMetrics,
    };
  }

  private async getAverageAssignmentTime(periodStart: Date): Promise<number> {
    const result = await this.leadModel.aggregate([
      {
        $match: {
          assignedAt: { $exists: true, $gte: periodStart },
          createdAt: { $exists: true },
          isDeleted: { $ne: true },
        },
      },
      {
        $project: {
          assignmentTimeMs: {
            $subtract: ['$assignedAt', '$createdAt'],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgTimeMs: { $avg: '$assignmentTimeMs' },
        },
      },
    ]);

    if (result.length === 0 || !result[0].avgTimeMs) {
      return 0;
    }

    // Convert ms to seconds
    return Math.round(result[0].avgTimeMs / 1000);
  }

  private async calculateOverloadedQueueRisk(): Promise<number> {
    // Simple calculation: percentage of fallback queue items not yet resolved
    const [totalFallback, unresolvedFallback] = await Promise.all([
      this.assignmentHistoryModel.countDocuments({
        isFallbackQueue: true,
      }),
      this.assignmentHistoryModel.countDocuments({
        isFallbackQueue: true,
        fallbackResolvedAt: { $exists: false },
      }),
    ]);

    if (totalFallback === 0) return 0;
    return Math.round((unresolvedFallback / totalFallback) * 100);
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
