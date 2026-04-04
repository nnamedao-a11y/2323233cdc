import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Activity } from '../schemas/activity.schema';
import { ActivityAction, ActivityEntityType } from '../enums/activity-action.enum';
import { CACHE_SERVICE, CacheService } from '../../../infrastructure/cache/cache.module';

export interface UserPerformanceStats {
  userId: string;
  userName?: string;
  period: 'day' | 'week' | 'month';
  
  // Leads
  leadsAssigned: number;
  leadsHandled: number;
  leadsConverted: number;
  leadsLost: number;
  
  // Calls
  callsMade: number;
  callsCompleted: number;
  callsMissed: number;
  callbacksScheduled: number;
  callbacksCompleted: number;
  
  // Response times
  avgResponseTimeMinutes: number;
  
  // Tasks
  tasksCreated: number;
  tasksCompleted: number;
  tasksOverdue: number;
  
  // Messages
  smsSent: number;
  emailsSent: number;
  
  // Documents
  documentsVerified: number;
  documentsRejected: number;
  
  // Calculated
  conversionRate: number;
  activityScore: number;
}

@Injectable()
export class ActivityAggregatorService {
  private readonly logger = new Logger(ActivityAggregatorService.name);

  constructor(
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @Inject(CACHE_SERVICE) private cache: CacheService,
  ) {}

  // Отримати performance статистику по користувачу
  async getUserPerformance(userId: string, period: 'day' | 'week' | 'month' = 'day'): Promise<UserPerformanceStats> {
    const startDate = this.getStartDate(period);
    
    const activities = await this.activityModel.find({
      userId,
      createdAt: { $gte: startDate },
    }).exec();

    const stats: UserPerformanceStats = {
      userId,
      period,
      leadsAssigned: 0,
      leadsHandled: 0,
      leadsConverted: 0,
      leadsLost: 0,
      callsMade: 0,
      callsCompleted: 0,
      callsMissed: 0,
      callbacksScheduled: 0,
      callbacksCompleted: 0,
      avgResponseTimeMinutes: 0,
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksOverdue: 0,
      smsSent: 0,
      emailsSent: 0,
      documentsVerified: 0,
      documentsRejected: 0,
      conversionRate: 0,
      activityScore: 0,
    };

    // Агрегуємо дані
    for (const activity of activities) {
      switch (activity.action) {
        case ActivityAction.LEAD_ASSIGNED:
          stats.leadsAssigned++;
          break;
        case ActivityAction.LEAD_STATUS_CHANGED:
          stats.leadsHandled++;
          break;
        case ActivityAction.LEAD_CONVERTED:
          stats.leadsConverted++;
          break;
        case ActivityAction.LEAD_DELETED:
          stats.leadsLost++;
          break;
        case ActivityAction.CALL_STARTED:
          stats.callsMade++;
          break;
        case ActivityAction.CALL_COMPLETED:
          stats.callsCompleted++;
          break;
        case ActivityAction.CALL_MISSED:
        case ActivityAction.CALL_NO_ANSWER:
          stats.callsMissed++;
          break;
        case ActivityAction.CALLBACK_SCHEDULED:
          stats.callbacksScheduled++;
          break;
        case ActivityAction.CALLBACK_COMPLETED:
          stats.callbacksCompleted++;
          break;
        case ActivityAction.TASK_CREATED:
          stats.tasksCreated++;
          break;
        case ActivityAction.TASK_COMPLETED:
          stats.tasksCompleted++;
          break;
        case ActivityAction.TASK_OVERDUE:
          stats.tasksOverdue++;
          break;
        case ActivityAction.SMS_SENT:
          stats.smsSent++;
          break;
        case ActivityAction.EMAIL_SENT:
          stats.emailsSent++;
          break;
        case ActivityAction.DOCUMENT_VERIFIED:
          stats.documentsVerified++;
          break;
        case ActivityAction.DOCUMENT_REJECTED:
          stats.documentsRejected++;
          break;
      }
    }

    // Розраховуємо метрики
    if (stats.leadsHandled > 0) {
      stats.conversionRate = Math.round((stats.leadsConverted / stats.leadsHandled) * 100);
    }

    // Activity score (простий скоринг)
    stats.activityScore = 
      stats.callsCompleted * 10 +
      stats.leadsConverted * 50 +
      stats.tasksCompleted * 5 +
      stats.documentsVerified * 3 -
      stats.callsMissed * 5 -
      stats.tasksOverdue * 10;

    return stats;
  }

  // Агрегована статистика по всіх менеджерах
  async getAllManagersPerformance(period: 'day' | 'week' | 'month' = 'day'): Promise<any[]> {
    const cacheKey = `${CacheService.KEYS.STAFF_PERFORMANCE}:all:${period}`;
    
    return this.cache.wrap(cacheKey, async () => {
      const startDate = this.getStartDate(period);

      const aggregation = await this.activityModel.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            userRole: { $in: ['manager'] },
          },
        },
        {
          $group: {
            _id: '$userId',
            userName: { $first: '$userName' },
            userRole: { $first: '$userRole' },
            totalActions: { $sum: 1 },
            calls: {
              $sum: {
                $cond: [{ $in: ['$action', ['call_started', 'call_completed']] }, 1, 0],
              },
            },
            callsMissed: {
              $sum: {
                $cond: [{ $in: ['$action', ['call_missed', 'call_no_answer']] }, 1, 0],
              },
            },
            leadsHandled: {
              $sum: {
                $cond: [{ $in: ['$action', ['lead_status_changed', 'lead_updated', 'lead_assigned']] }, 1, 0],
              },
            },
            leadsConverted: {
              $sum: {
                $cond: [{ $eq: ['$action', 'lead_converted'] }, 1, 0],
              },
            },
            tasksCompleted: {
              $sum: {
                $cond: [{ $eq: ['$action', 'task_completed'] }, 1, 0],
              },
            },
            tasksOverdue: {
              $sum: {
                $cond: [{ $eq: ['$action', 'task_overdue'] }, 1, 0],
              },
            },
            lastActivity: { $max: '$createdAt' },
          },
        },
        {
          $sort: { totalActions: -1 },
        },
      ]);

      return aggregation.map(m => ({
        userId: m._id,
        userName: m.userName || 'Unknown',
        userRole: m.userRole,
        totalActions: m.totalActions,
        calls: m.calls,
        callsMissed: m.callsMissed,
        leadsHandled: m.leadsHandled,
        leadsConverted: m.leadsConverted,
        tasksCompleted: m.tasksCompleted,
        tasksOverdue: m.tasksOverdue,
        lastActivity: m.lastActivity,
        conversionRate: m.leadsHandled > 0 ? Math.round((m.leadsConverted / m.leadsHandled) * 100) : 0,
      }));
    }, CacheService.TTL.MEDIUM);
  }

  // Кількість активностей за дією
  async getActionCounts(startDate?: Date, endDate?: Date): Promise<Record<string, number>> {
    const filter: any = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate;
      if (endDate) filter.createdAt.$lte = endDate;
    }

    const aggregation = await this.activityModel.aggregate([
      { $match: filter },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]);

    return aggregation.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {});
  }

  // Неактивні менеджери (без активності за X годин)
  async getInactiveManagers(hoursThreshold = 2): Promise<any[]> {
    const cacheKey = `${CacheService.KEYS.STAFF_INACTIVE}:${hoursThreshold}`;
    
    return this.cache.wrap(cacheKey, async () => {
      const thresholdDate = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

      const activeUserIds = await this.activityModel.distinct('userId', {
        createdAt: { $gte: thresholdDate },
        userRole: { $in: ['manager'] },
      });

      // Повертаємо список користувачів, яких немає в активних
      const allRecentUsers = await this.activityModel.aggregate([
        {
          $match: {
            userRole: { $in: ['manager'] },
          },
        },
        {
          $group: {
            _id: '$userId',
            userName: { $first: '$userName' },
            userRole: { $first: '$userRole' },
            lastActivity: { $max: '$createdAt' },
          },
        },
        {
          $match: {
            _id: { $nin: activeUserIds },
          },
        },
      ]);

      return allRecentUsers.map(u => ({
        userId: u._id,
        userName: u.userName,
        userRole: u.userRole,
        lastActivity: u.lastActivity,
        inactiveHours: Math.round((Date.now() - new Date(u.lastActivity).getTime()) / (1000 * 60 * 60)),
      }));
    }, CacheService.TTL.SHORT);
  }

  // SLA breaches count
  async getSlaBreachCount(startDate?: Date): Promise<number> {
    const filter: any = { action: ActivityAction.SLA_BREACH };
    if (startDate) filter.createdAt = { $gte: startDate };
    return this.activityModel.countDocuments(filter);
  }

  private getStartDate(period: 'day' | 'week' | 'month'): Date {
    const now = new Date();
    switch (period) {
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week':
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        return new Date(now.setDate(diff));
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }
}
