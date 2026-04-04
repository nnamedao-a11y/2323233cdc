import { Injectable, Logger } from '@nestjs/common';
import { ManagerWorkload } from '../interfaces/routing.interface';
import { AssignmentStrategy } from '../enums/assignment.enum';

@Injectable()
export class LeadRoutingStrategyService {
  private readonly logger = new Logger(LeadRoutingStrategyService.name);

  /**
   * Select manager based on strategy
   */
  select(strategy: AssignmentStrategy, managers: ManagerWorkload[]): ManagerWorkload | null {
    if (managers.length === 0) {
      return null;
    }

    switch (strategy) {
      case AssignmentStrategy.ROUND_ROBIN:
        return this.selectRoundRobin(managers);
      case AssignmentStrategy.LEAST_LOADED:
        return this.selectLeastLoaded(managers);
      case AssignmentStrategy.FALLBACK:
        return this.selectFallback(managers);
      default:
        return this.selectLeastLoaded(managers); // Default to least loaded
    }
  }

  /**
   * Round Robin: Select manager who hasn't been assigned for longest time
   */
  selectRoundRobin(managers: ManagerWorkload[]): ManagerWorkload | null {
    if (managers.length === 0) return null;

    // Sort by lastAssignedAt ascending (oldest first)
    const sorted = [...managers].sort((a, b) => {
      const aTime = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
      const bTime = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
      return aTime - bTime;
    });

    this.logger.debug(`Round Robin selected: ${sorted[0].firstName} ${sorted[0].lastName}`);
    return sorted[0];
  }

  /**
   * Least Loaded: Select manager with lowest workload score
   * Score = (activeLeads * 2) + openTasks + (overdueTasks * 3)
   */
  selectLeastLoaded(managers: ManagerWorkload[]): ManagerWorkload | null {
    if (managers.length === 0) return null;

    // Sort by score ascending (lowest first)
    const sorted = [...managers].sort((a, b) => {
      // Primary: score
      if (a.score !== b.score) {
        return a.score - b.score;
      }

      // Tie-breaker 1: lastAssignedAt (oldest first)
      const aTime = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
      const bTime = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
      if (aTime !== bTime) {
        return aTime - bTime;
      }

      // Tie-breaker 2: assignmentPriority (higher first)
      const aPrio = a.assignmentPriority || 0;
      const bPrio = b.assignmentPriority || 0;
      if (aPrio !== bPrio) {
        return bPrio - aPrio;
      }

      // Tie-breaker 3: activeLeads (fewer first)
      return a.activeLeads - b.activeLeads;
    });

    this.logger.debug(
      `Least Loaded selected: ${sorted[0].firstName} ${sorted[0].lastName} (score: ${sorted[0].score})`
    );
    return sorted[0];
  }

  /**
   * Fallback: Just pick anyone available, prefer least loaded
   */
  selectFallback(managers: ManagerWorkload[]): ManagerWorkload | null {
    return this.selectLeastLoaded(managers);
  }

  /**
   * Get sorted list of all managers by workload (for dashboard/reporting)
   */
  getSortedByWorkload(managers: ManagerWorkload[]): ManagerWorkload[] {
    return [...managers].sort((a, b) => a.score - b.score);
  }

  /**
   * Calculate statistics for manager pool
   */
  calculatePoolStats(managers: ManagerWorkload[]): {
    totalManagers: number;
    availableManagers: number;
    totalActiveLeads: number;
    totalOpenTasks: number;
    totalOverdueTasks: number;
    averageScore: number;
    minScore: number;
    maxScore: number;
  } {
    if (managers.length === 0) {
      return {
        totalManagers: 0,
        availableManagers: 0,
        totalActiveLeads: 0,
        totalOpenTasks: 0,
        totalOverdueTasks: 0,
        averageScore: 0,
        minScore: 0,
        maxScore: 0,
      };
    }

    const totalActiveLeads = managers.reduce((sum, m) => sum + m.activeLeads, 0);
    const totalOpenTasks = managers.reduce((sum, m) => sum + m.openTasks, 0);
    const totalOverdueTasks = managers.reduce((sum, m) => sum + m.overdueTasks, 0);
    const scores = managers.map(m => m.score);

    return {
      totalManagers: managers.length,
      availableManagers: managers.filter(m => m.isAvailable).length,
      totalActiveLeads,
      totalOpenTasks,
      totalOverdueTasks,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
    };
  }
}
