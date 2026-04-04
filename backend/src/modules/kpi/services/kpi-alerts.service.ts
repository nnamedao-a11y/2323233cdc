import { Injectable } from '@nestjs/common';
import { ManagerStats } from './kpi-aggregator.service';

export interface KPIAlert {
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  messageUk: string;
  value?: number;
  threshold?: number;
}

@Injectable()
export class KPIAlertsService {
  
  evaluate(stats: ManagerStats): KPIAlert[] {
    const alerts: KPIAlert[] = [];

    // CRITICAL: HOT leads missed
    if (stats.hotLeadsMissed > 0) {
      alerts.push({
        type: 'CRITICAL',
        code: 'HOT_LEADS_MISSED',
        message: `${stats.hotLeadsMissed} HOT leads not contacted`,
        messageUk: `${stats.hotLeadsMissed} гарячих лідів не оброблено`,
        value: stats.hotLeadsMissed,
        threshold: 0,
      });
    }

    // CRITICAL: Tasks overdue
    if (stats.tasksOverdue > 3) {
      alerts.push({
        type: 'CRITICAL',
        code: 'TASKS_OVERDUE',
        message: `${stats.tasksOverdue} overdue tasks`,
        messageUk: `${stats.tasksOverdue} прострочених задач`,
        value: stats.tasksOverdue,
        threshold: 3,
      });
    }

    // WARNING: Low conversion rate
    if (stats.leads >= 10 && stats.conversionRate < 0.05) {
      alerts.push({
        type: 'WARNING',
        code: 'LOW_CONVERSION',
        message: `Conversion rate ${(stats.conversionRate * 100).toFixed(1)}% is below 5%`,
        messageUk: `Конверсія ${(stats.conversionRate * 100).toFixed(1)}% нижче 5%`,
        value: stats.conversionRate * 100,
        threshold: 5,
      });
    }

    // WARNING: Low contact rate
    if (stats.leads >= 5 && stats.contactRate < 0.5) {
      alerts.push({
        type: 'WARNING',
        code: 'LOW_CONTACT_RATE',
        message: `Only ${(stats.contactRate * 100).toFixed(0)}% of leads contacted`,
        messageUk: `Тільки ${(stats.contactRate * 100).toFixed(0)}% лідів контактовано`,
        value: stats.contactRate * 100,
        threshold: 50,
      });
    }

    // WARNING: Not enough calls
    if (stats.leads > 0 && stats.callAttempts < stats.leads * 0.5) {
      alerts.push({
        type: 'WARNING',
        code: 'LOW_CALL_ACTIVITY',
        message: 'Not enough call attempts',
        messageUk: 'Недостатньо дзвінків',
        value: stats.callAttempts,
        threshold: stats.leads * 0.5,
      });
    }

    // INFO: New leads waiting
    if (stats.newLeads > 5) {
      alerts.push({
        type: 'INFO',
        code: 'NEW_LEADS_WAITING',
        message: `${stats.newLeads} new leads waiting for contact`,
        messageUk: `${stats.newLeads} нових лідів чекають контакту`,
        value: stats.newLeads,
      });
    }

    return alerts;
  }

  // Get critical alerts only
  getCritical(stats: ManagerStats): KPIAlert[] {
    return this.evaluate(stats).filter(a => a.type === 'CRITICAL');
  }

  // Check if manager needs attention
  needsAttention(stats: ManagerStats): boolean {
    const alerts = this.evaluate(stats);
    return alerts.some(a => a.type === 'CRITICAL' || a.type === 'WARNING');
  }
}
