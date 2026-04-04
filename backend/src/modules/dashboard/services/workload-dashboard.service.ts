import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../users/user.schema';
import { Lead } from '../../leads/lead.schema';
import { Task } from '../../tasks/task.schema';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { WorkloadDashboardMetrics, ManagerWorkload } from '../interfaces/dashboard-response.interface';
import { WORKLOAD_THRESHOLDS } from '../constants/dashboard-cache.constants';
import { UserRole } from '../../../shared/enums';

@Injectable()
export class WorkloadDashboardService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
  ) {}

  async getMetrics(query: DashboardQueryDto): Promise<WorkloadDashboardMetrics> {
    // Get all active managers
    const managers = await this.userModel.find({
      role: UserRole.MANAGER,
      isActive: true,
      isDeleted: { $ne: true },
    }).select('id firstName lastName currentActiveLeads currentOpenTasks currentOverdueTasks').lean();

    // Calculate real-time workload for each manager
    const managerWorkloads: ManagerWorkload[] = await Promise.all(
      managers.map(async (manager) => {
        const [leadsCount, tasksStats] = await Promise.all([
          this.getActiveLeadsCount(manager.id),
          this.getTasksStats(manager.id),
        ]);

        const score = this.calculateWorkloadScore(
          leadsCount,
          tasksStats.openTasks,
          tasksStats.overdueTasks,
        );

        return {
          managerId: manager.id,
          name: `${manager.firstName} ${manager.lastName}`,
          activeLeads: leadsCount,
          openTasks: tasksStats.openTasks,
          overdueTasks: tasksStats.overdueTasks,
          score,
          status: this.getWorkloadStatus(score, leadsCount),
        };
      }),
    );

    // Sort by score descending
    managerWorkloads.sort((a, b) => b.score - a.score);

    const overloadedManagers = managerWorkloads.filter(m => m.status === 'overloaded').length;
    const idleManagers = managerWorkloads.filter(m => m.status === 'idle').length;
    const busyManagers = managerWorkloads.filter(m => m.status === 'busy').length;

    return {
      totalManagers: managers.length,
      overloadedManagers,
      idleManagers,
      busyManagers,
      managers: managerWorkloads,
    };
  }

  private async getActiveLeadsCount(managerId: string): Promise<number> {
    return this.leadModel.countDocuments({
      assignedTo: managerId,
      status: { $nin: ['won', 'lost', 'archived'] },
      isDeleted: { $ne: true },
    });
  }

  private async getTasksStats(managerId: string): Promise<{ openTasks: number; overdueTasks: number }> {
    const now = new Date();

    const [openTasks, overdueTasks] = await Promise.all([
      this.taskModel.countDocuments({
        assignedTo: managerId,
        status: { $in: ['todo', 'in_progress'] },
        isDeleted: { $ne: true },
      }),
      this.taskModel.countDocuments({
        assignedTo: managerId,
        status: { $in: ['todo', 'in_progress'] },
        dueDate: { $lt: now },
        isDeleted: { $ne: true },
      }),
    ]);

    return { openTasks, overdueTasks };
  }

  private calculateWorkloadScore(
    activeLeads: number,
    openTasks: number,
    overdueTasks: number,
  ): number {
    // Formula: activeLeads*2 + openTasks + overdueTasks*3
    return activeLeads * 2 + openTasks + overdueTasks * 3;
  }

  private getWorkloadStatus(
    score: number,
    activeLeads: number,
  ): 'ok' | 'busy' | 'overloaded' | 'idle' {
    if (activeLeads === 0 && score === 0) return 'idle';
    if (score >= WORKLOAD_THRESHOLDS.OVERLOADED_SCORE) return 'overloaded';
    if (score >= WORKLOAD_THRESHOLDS.BUSY_SCORE) return 'busy';
    return 'ok';
  }
}
