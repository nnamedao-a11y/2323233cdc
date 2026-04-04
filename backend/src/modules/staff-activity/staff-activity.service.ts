import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StaffActivity, ActivityType } from './staff-activity.schema';
import { User } from '../users/user.schema';
import { Lead } from '../leads/lead.schema';
import { Deal } from '../deals/deal.schema';
import { Task } from '../tasks/task.schema';
import { HistoryReport } from '../history-reports/history-report.schema';
import { generateId } from '../../shared/utils';

export interface ManagerHealthCard {
  managerId: string;
  managerName: string;
  email: string;
  
  // Status
  isOnline: boolean;
  currentSessionId?: string;
  
  // Today's metrics
  firstLoginToday?: Date;
  totalActiveMinutesToday: number;
  
  // Activity metrics
  leadsViewedToday: number;
  callsAttemptedToday: number;
  callsCompletedToday: number;
  notesAddedToday: number;
  tasksCompletedToday: number;
  
  // Hot leads
  hotLeadsTouchedToday: number;
  hotLeadsMissedToday: number;
  
  // Reports
  reportsApprovedToday: number;
  reportSpendToday: number;
  
  // Issues
  missedRemindersToday: number;
  unresolvedNextActions: number;
  
  // Anomalies
  hasSessionAnomalies: boolean;
  anomalyReasons: string[];
  
  // Performance score (0-100)
  performanceScore: number;
}

export interface ActivityProblem {
  type: 'NO_CALLS' | 'NO_NOTES' | 'MISSED_HOT' | 'IDLE' | 'HIGH_SPEND_LOW_ROI' | 'MANY_SHORT_SESSIONS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  messageUk: string;
  data?: any;
}

@Injectable()
export class StaffActivityService {
  private readonly logger = new Logger(StaffActivityService.name);
  
  constructor(
    @InjectModel(StaffActivity.name) private activityModel: Model<StaffActivity>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(Deal.name) private dealModel: Model<Deal>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(HistoryReport.name) private reportModel: Model<HistoryReport>,
  ) {}

  // === LOG ACTIVITY ===
  
  async logActivity(
    userId: string,
    type: ActivityType,
    sessionId?: string,
    entityType?: string,
    entityId?: string,
    metadata?: any,
    duration?: number,
    ipAddress?: string,
  ): Promise<StaffActivity> {
    const activity = new this.activityModel({
      id: generateId(),
      userId,
      sessionId,
      type,
      entityType,
      entityId,
      metadata,
      duration,
      ipAddress,
    });

    await activity.save();
    return activity;
  }

  // === GET MANAGER HEALTH CARD ===
  
  async getManagerHealthCard(managerId: string): Promise<ManagerHealthCard> {
    const user = await this.userModel.findOne({ id: managerId });
    if (!user) throw new Error('Manager not found');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get today's activities
    const todayActivities = await this.activityModel.find({
      userId: managerId,
      createdAt: { $gte: todayStart },
    });

    // Calculate metrics
    const firstLoginToday = todayActivities.find(a => a.type === ActivityType.LOGIN)?.createdAt;
    
    const leadsViewedToday = todayActivities.filter(a => a.type === ActivityType.LEAD_VIEWED).length;
    const callsAttemptedToday = todayActivities.filter(a => a.type === ActivityType.CALL_ATTEMPTED).length;
    const callsCompletedToday = todayActivities.filter(a => a.type === ActivityType.CALL_COMPLETED).length;
    const notesAddedToday = todayActivities.filter(a => a.type === ActivityType.NOTE_ADDED).length;
    const tasksCompletedToday = todayActivities.filter(a => a.type === ActivityType.TASK_COMPLETED).length;
    const reportsApprovedToday = todayActivities.filter(a => a.type === ActivityType.REPORT_APPROVED).length;
    const missedRemindersToday = todayActivities.filter(a => a.type === ActivityType.REMINDER_MISSED).length;

    // Hot leads metrics
    const hotLeads = await this.leadModel.find({
      assignedTo: managerId,
      intentLevel: 'hot',
      createdAt: { $gte: todayStart },
      isDeleted: false,
    });

    const hotLeadIds = hotLeads.map(l => l.id);
    const touchedHotLeads = todayActivities.filter(
      a => a.entityType === 'lead' && hotLeadIds.includes(a.entityId || '')
    );

    const hotLeadsTouchedToday = new Set(touchedHotLeads.map(a => a.entityId)).size;
    const hotLeadsMissedToday = hotLeads.length - hotLeadsTouchedToday;

    // Report spend
    const reportsToday = await this.reportModel.find({
      managerId,
      createdAt: { $gte: todayStart },
    });
    const reportSpendToday = reportsToday.reduce((sum, r) => sum + (r.cost || 0), 0);

    // Unresolved tasks
    const unresolvedNextActions = await this.taskModel.countDocuments({
      assignedTo: managerId,
      status: { $ne: 'completed' },
      dueDate: { $lt: new Date() },
    });

    // Calculate active time (rough estimate based on activity gaps)
    let totalActiveMinutesToday = 0;
    if (todayActivities.length > 1) {
      const sorted = todayActivities.sort((a, b) => 
        new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime()
      );
      for (let i = 1; i < sorted.length; i++) {
        const gap = new Date(sorted[i].createdAt as any).getTime() - 
                    new Date(sorted[i-1].createdAt as any).getTime();
        // Count gaps less than 30 min as active time
        if (gap < 30 * 60 * 1000) {
          totalActiveMinutesToday += gap / 60000;
        }
      }
    }

    // Detect anomalies
    const anomalyReasons: string[] = [];
    const loginCount = todayActivities.filter(a => a.type === ActivityType.LOGIN).length;
    if (loginCount > 5) {
      anomalyReasons.push('Багато входів за день');
    }
    if (callsAttemptedToday > 0 && callsCompletedToday === 0) {
      anomalyReasons.push('Всі дзвінки без відповіді');
    }
    if (leadsViewedToday > 20 && notesAddedToday === 0) {
      anomalyReasons.push('Переглянуто багато лідів без нотаток');
    }

    // Calculate performance score
    let performanceScore = 50; // Base
    performanceScore += Math.min(callsCompletedToday * 5, 20);
    performanceScore += Math.min(notesAddedToday * 3, 15);
    performanceScore += Math.min(tasksCompletedToday * 5, 15);
    performanceScore -= hotLeadsMissedToday * 10;
    performanceScore -= missedRemindersToday * 5;
    performanceScore = Math.max(0, Math.min(100, performanceScore));

    // Check if online (any activity in last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentActivity = todayActivities.find(a => 
      new Date(a.createdAt as any) > tenMinutesAgo
    );
    const isOnline = !!recentActivity;

    return {
      managerId,
      managerName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      isOnline,
      currentSessionId: recentActivity?.sessionId,
      firstLoginToday,
      totalActiveMinutesToday: Math.round(totalActiveMinutesToday),
      leadsViewedToday,
      callsAttemptedToday,
      callsCompletedToday,
      notesAddedToday,
      tasksCompletedToday,
      hotLeadsTouchedToday,
      hotLeadsMissedToday,
      reportsApprovedToday,
      reportSpendToday,
      missedRemindersToday,
      unresolvedNextActions,
      hasSessionAnomalies: anomalyReasons.length > 0,
      anomalyReasons,
      performanceScore,
    };
  }

  // === GET TEAM HEALTH ===
  
  async getTeamHealth(managerIds: string[]): Promise<ManagerHealthCard[]> {
    return Promise.all(managerIds.map(id => this.getManagerHealthCard(id)));
  }

  // === DETECT PROBLEMS ===
  
  async detectProblems(managerId: string): Promise<ActivityProblem[]> {
    const health = await this.getManagerHealthCard(managerId);
    const problems: ActivityProblem[] = [];

    // No calls but logged in
    if (health.totalActiveMinutesToday > 60 && health.callsAttemptedToday === 0) {
      problems.push({
        type: 'NO_CALLS',
        severity: 'HIGH',
        message: 'Logged in but no calls attempted',
        messageUk: 'Увійшов, але не здійснив жодного дзвінка',
      });
    }

    // Many leads viewed, no notes
    if (health.leadsViewedToday > 10 && health.notesAddedToday === 0) {
      problems.push({
        type: 'NO_NOTES',
        severity: 'MEDIUM',
        message: 'Viewed many leads without adding notes',
        messageUk: 'Переглянув багато лідів без нотаток',
      });
    }

    // Missed hot leads
    if (health.hotLeadsMissedToday > 0) {
      problems.push({
        type: 'MISSED_HOT',
        severity: 'HIGH',
        message: `${health.hotLeadsMissedToday} hot leads not touched`,
        messageUk: `${health.hotLeadsMissedToday} гарячих лідів не оброблено`,
      });
    }

    // High report spend
    if (health.reportsApprovedToday > 3 && health.reportSpendToday > 50) {
      problems.push({
        type: 'HIGH_SPEND_LOW_ROI',
        severity: 'MEDIUM',
        message: `High report spend: $${health.reportSpendToday}`,
        messageUk: `Високі витрати на звіти: $${health.reportSpendToday}`,
      });
    }

    // Session anomalies
    if (health.hasSessionAnomalies) {
      problems.push({
        type: 'MANY_SHORT_SESSIONS',
        severity: 'LOW',
        message: health.anomalyReasons.join(', '),
        messageUk: health.anomalyReasons.join(', '),
      });
    }

    return problems;
  }

  // === GET ACTIVITY TIMELINE ===
  
  async getActivityTimeline(managerId: string, hours: number = 24): Promise<StaffActivity[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.activityModel.find({
      userId: managerId,
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 });
  }

  // === ANALYTICS ===
  
  async getActivityAnalytics(periodDays: number = 7): Promise<any> {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    const [byType, byManager, hourlyDistribution] = await Promise.all([
      this.activityModel.aggregate([
        { $match: { createdAt: { $gte: periodStart } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      
      this.activityModel.aggregate([
        { $match: { createdAt: { $gte: periodStart } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      
      this.activityModel.aggregate([
        { $match: { createdAt: { $gte: periodStart } } },
        { $project: { hour: { $hour: '$createdAt' } } },
        { $group: { _id: '$hour', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      byType: byType.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      topManagers: byManager,
      hourlyDistribution: hourlyDistribution.map(h => ({ hour: h._id, count: h.count })),
      periodDays,
    };
  }
}
