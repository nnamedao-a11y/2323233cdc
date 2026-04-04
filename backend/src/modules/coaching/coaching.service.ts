import { Injectable } from '@nestjs/common';
import { KPIService } from '../kpi/kpi.service';
import { CoachingDetectorService, CoachingIssue } from './services/coaching-detector.service';
import { CoachingValidatorService } from './services/coaching-validator.service';
import { CoachingAdviceService, CoachingAdvice } from './services/coaching-advice.service';

export interface CoachingItem {
  issue: CoachingIssue;
  advice: CoachingAdvice;
}

export interface ManagerCoaching {
  managerId: string;
  coaching: CoachingItem[];
  hasIssues: boolean;
  totalIssues: number;
  highPriorityCount: number;
}

@Injectable()
export class CoachingService {
  // Max coaching items to show at once
  private readonly MAX_COACHING_ITEMS = 3;

  constructor(
    private kpiService: KPIService,
    private detector: CoachingDetectorService,
    private validator: CoachingValidatorService,
    private adviceBuilder: CoachingAdviceService,
  ) {}

  async getCoaching(managerId: string, periodDays: number = 30): Promise<ManagerCoaching> {
    // Get manager KPI
    const kpi = await this.kpiService.getManagerKPI(managerId, periodDays);
    const stats = kpi.stats;

    // Detect issues
    const allIssues = this.detector.detect(stats);

    // Validate and filter
    const validIssues = allIssues.filter(issue => 
      this.validator.validate(issue, stats, managerId)
    );

    // Build advice for valid issues
    const coaching: CoachingItem[] = validIssues
      .map(issue => {
        const advice = this.adviceBuilder.build(issue);
        if (advice) {
          // Mark as shown
          this.validator.markShown(issue, managerId);
          return { issue, advice };
        }
        return null;
      })
      .filter((item): item is CoachingItem => item !== null)
      .sort((a, b) => a.advice.priority - b.advice.priority)
      .slice(0, this.MAX_COACHING_ITEMS);

    const highPriorityCount = coaching.filter(c => c.advice.priority === 1).length;

    return {
      managerId,
      coaching,
      hasIssues: coaching.length > 0,
      totalIssues: validIssues.length,
      highPriorityCount,
    };
  }

  async getTeamCoaching(teamLeadId: string, managerIds: string[]): Promise<ManagerCoaching[]> {
    const results = await Promise.all(
      managerIds.map(id => this.getCoaching(id))
    );

    // Sort by high priority issues first
    return results.sort((a, b) => b.highPriorityCount - a.highPriorityCount);
  }

  // Get only high priority coaching (for notifications)
  async getUrgentCoaching(managerId: string): Promise<CoachingItem[]> {
    const coaching = await this.getCoaching(managerId);
    return coaching.coaching.filter(c => c.advice.priority === 1);
  }
}
