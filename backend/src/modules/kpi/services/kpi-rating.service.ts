import { Injectable } from '@nestjs/common';
import { ManagerStats } from './kpi-aggregator.service';

export interface ManagerRating {
  managerId: string;
  score: number;
  rank?: number;
  tier: 'gold' | 'silver' | 'bronze' | 'needs_improvement';
  breakdown: {
    deals: number;
    qualified: number;
    calls: number;
    tasks: number;
    penalties: number;
  };
}

@Injectable()
export class KPIRatingService {
  
  // Weight configuration
  private readonly WEIGHTS = {
    deal: 50,           // Points per closed deal
    qualified: 20,      // Points per qualified lead
    call: 5,            // Points per call attempt (max 100)
    taskCompleted: 10,  // Points per completed task
    hotMissedPenalty: -30, // Penalty per missed HOT lead
    overduePenalty: -10,   // Penalty per overdue task
  };

  calculate(stats: ManagerStats): ManagerRating {
    const breakdown = {
      deals: stats.dealsWon * this.WEIGHTS.deal,
      qualified: stats.qualified * this.WEIGHTS.qualified,
      calls: Math.min(stats.callAttempts * this.WEIGHTS.call, 100),
      tasks: stats.tasksCompleted * this.WEIGHTS.taskCompleted,
      penalties: (
        stats.hotLeadsMissed * this.WEIGHTS.hotMissedPenalty +
        stats.tasksOverdue * this.WEIGHTS.overduePenalty
      ),
    };

    const score = Math.max(0,
      breakdown.deals +
      breakdown.qualified +
      breakdown.calls +
      breakdown.tasks +
      breakdown.penalties
    );

    const tier = this.getTier(score);

    return {
      managerId: stats.managerId,
      score,
      tier,
      breakdown,
    };
  }

  private getTier(score: number): 'gold' | 'silver' | 'bronze' | 'needs_improvement' {
    if (score >= 500) return 'gold';
    if (score >= 300) return 'silver';
    if (score >= 150) return 'bronze';
    return 'needs_improvement';
  }

  // Calculate ratings for multiple managers and assign ranks
  calculateTeamRatings(statsArray: ManagerStats[]): ManagerRating[] {
    const ratings = statsArray.map(s => this.calculate(s));
    
    // Sort by score descending
    ratings.sort((a, b) => b.score - a.score);
    
    // Assign ranks
    ratings.forEach((r, i) => {
      r.rank = i + 1;
    });

    return ratings;
  }
}
