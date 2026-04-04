import { Injectable } from '@nestjs/common';
import { ManagerStats } from '../../kpi/services/kpi-aggregator.service';

export interface CoachingIssue {
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  detectedAt: Date;
  data?: any;
}

@Injectable()
export class CoachingDetectorService {
  
  detect(stats: ManagerStats): CoachingIssue[] {
    const issues: CoachingIssue[] = [];
    const now = new Date();

    // HIGH: HOT leads missed
    if (stats.hotLeadsMissed >= 2) {
      issues.push({
        type: 'HOT_LEAD_MISSED',
        severity: 'HIGH',
        detectedAt: now,
        data: { count: stats.hotLeadsMissed },
      });
    }

    // HIGH: Very low conversion with enough data
    if (stats.leads >= 15 && stats.conversionRate < 0.03) {
      issues.push({
        type: 'VERY_LOW_CONVERSION',
        severity: 'HIGH',
        detectedAt: now,
        data: { rate: stats.conversionRate, leads: stats.leads },
      });
    }

    // MEDIUM: Low call activity
    if (stats.leads > 0 && stats.callAttempts < stats.leads * 0.5) {
      issues.push({
        type: 'LOW_CALL_ACTIVITY',
        severity: 'MEDIUM',
        detectedAt: now,
        data: { calls: stats.callAttempts, leads: stats.leads },
      });
    }

    // MEDIUM: Low conversion (moderate)
    if (stats.leads >= 10 && stats.conversionRate < 0.05 && stats.conversionRate >= 0.03) {
      issues.push({
        type: 'LOW_CONVERSION',
        severity: 'MEDIUM',
        detectedAt: now,
        data: { rate: stats.conversionRate },
      });
    }

    // MEDIUM: Many overdue tasks
    if (stats.tasksOverdue >= 3) {
      issues.push({
        type: 'TASKS_OVERDUE',
        severity: 'MEDIUM',
        detectedAt: now,
        data: { count: stats.tasksOverdue },
      });
    }

    // LOW: Low contact rate
    if (stats.leads >= 5 && stats.contactRate < 0.6) {
      issues.push({
        type: 'LOW_CONTACT_RATE',
        severity: 'LOW',
        detectedAt: now,
        data: { rate: stats.contactRate },
      });
    }

    // LOW: No deals but has qualified leads
    if (stats.qualified >= 3 && stats.dealsWon === 0) {
      issues.push({
        type: 'QUALIFIED_NO_DEALS',
        severity: 'LOW',
        detectedAt: now,
        data: { qualified: stats.qualified },
      });
    }

    return issues;
  }
}
