import { Injectable } from '@nestjs/common';
import { CoachingIssue } from './coaching-detector.service';
import { ManagerStats } from '../../kpi/services/kpi-aggregator.service';

// Track shown advice to prevent spam
const shownAdvice = new Map<string, Date>();

@Injectable()
export class CoachingValidatorService {
  
  // Minimum data requirements
  private readonly MIN_LEADS_FOR_CONVERSION = 10;
  private readonly MIN_LEADS_FOR_CONTACT = 5;
  private readonly COOLDOWN_HOURS = 6;

  validate(issue: CoachingIssue, stats: ManagerStats, managerId: string): boolean {
    // Check minimum data requirements
    if (!this.hasEnoughData(issue, stats)) {
      return false;
    }

    // Check cooldown (don't repeat same advice too often)
    if (!this.passedCooldown(issue, managerId)) {
      return false;
    }

    // Check confidence (some issues need more data)
    if (!this.hasConfidence(issue, stats)) {
      return false;
    }

    return true;
  }

  private hasEnoughData(issue: CoachingIssue, stats: ManagerStats): boolean {
    switch (issue.type) {
      case 'LOW_CONVERSION':
      case 'VERY_LOW_CONVERSION':
        return stats.leads >= this.MIN_LEADS_FOR_CONVERSION;
      
      case 'LOW_CONTACT_RATE':
        return stats.leads >= this.MIN_LEADS_FOR_CONTACT;
      
      case 'QUALIFIED_NO_DEALS':
        return stats.qualified >= 3;
      
      default:
        return true;
    }
  }

  private passedCooldown(issue: CoachingIssue, managerId: string): boolean {
    const key = `${managerId}:${issue.type}`;
    const lastShown = shownAdvice.get(key);
    
    if (!lastShown) {
      return true;
    }

    const hoursSinceShown = (Date.now() - lastShown.getTime()) / (1000 * 60 * 60);
    return hoursSinceShown >= this.COOLDOWN_HOURS;
  }

  private hasConfidence(issue: CoachingIssue, stats: ManagerStats): boolean {
    // For conversion issues, need more data for higher confidence
    if (issue.type === 'LOW_CONVERSION' && stats.leads < 15) {
      return false;
    }
    
    if (issue.type === 'VERY_LOW_CONVERSION' && stats.leads < 20) {
      return false;
    }

    return true;
  }

  // Mark advice as shown
  markShown(issue: CoachingIssue, managerId: string): void {
    const key = `${managerId}:${issue.type}`;
    shownAdvice.set(key, new Date());
  }

  // Clean old entries periodically
  cleanOldEntries(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, date] of shownAdvice.entries()) {
      if (now - date.getTime() > maxAge) {
        shownAdvice.delete(key);
      }
    }
  }
}
