import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../users/user.schema';
import { Task } from '../../tasks/task.schema';
import { Lead } from '../../leads/lead.schema';
import { UserRole, TaskStatus } from '../../../shared/enums';
import { ManagerWorkload, RoutingContext } from '../interfaces/routing.interface';

@Injectable()
export class ManagerAvailabilityService {
  private readonly logger = new Logger(ManagerAvailabilityService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
  ) {}

  /**
   * Get all managers eligible for lead assignment
   */
  async getEligibleManagers(
    context: RoutingContext,
    options: {
      allowedRoles?: string[];
      onlyAvailable?: boolean;
      maxActiveLeads?: number;
      supportedMarkets?: string[];
      supportedLanguages?: string[];
      supportedSources?: string[];
    } = {},
  ): Promise<ManagerWorkload[]> {
    const {
      allowedRoles = ['manager'],
      onlyAvailable = true,
      maxActiveLeads,
      supportedMarkets,
      supportedLanguages,
      supportedSources,
    } = options;

    // Build filter for users
    const userFilter: any = {
      isDeleted: false,
      isActive: true,
      role: { $in: allowedRoles },
    };

    // If onlyAvailable, check isAvailableForAssignment flag
    if (onlyAvailable) {
      userFilter.$or = [
        { isAvailableForAssignment: true },
        { isAvailableForAssignment: { $exists: false } }, // Default to available if not set
      ];
    }

    // Get all matching users
    let users = await this.userModel.find(userFilter).lean();

    // Filter by supported markets if specified
    if (supportedMarkets?.length && context.market) {
      users = users.filter(u => {
        if (!u['supportedMarkets']?.length) return true; // No restriction
        return u['supportedMarkets'].includes(context.market!);
      });
    }

    // Filter by supported languages if specified
    if (supportedLanguages?.length && context.language) {
      users = users.filter(u => {
        if (!u['supportedLanguages']?.length) return true;
        return u['supportedLanguages'].includes(context.language!);
      });
    }

    // Filter by supported sources if specified
    if (supportedSources?.length && context.source) {
      users = users.filter(u => {
        if (!u['supportedSources']?.length) return true;
        return u['supportedSources'].includes(context.source!);
      });
    }

    // Calculate workload for each user
    const workloads = await Promise.all(
      users.map(async (user) => this.calculateWorkload(user))
    );

    // Filter by max active leads if specified
    let result = workloads;
    if (maxActiveLeads) {
      result = workloads.filter(w => w.activeLeads < maxActiveLeads);
    }

    // Also filter by user's own maxActiveLeads setting
    result = result.filter(w => {
      if (!w.maxActiveLeads) return true;
      return w.activeLeads < w.maxActiveLeads;
    });

    this.logger.debug(`Found ${result.length} eligible managers for context: ${JSON.stringify(context)}`);
    return result;
  }

  /**
   * Calculate workload score for a single user
   */
  async calculateWorkload(user: any): Promise<ManagerWorkload> {
    const userId = user.id || user._id?.toString();

    // Count active leads assigned to this user
    const activeLeads = await this.leadModel.countDocuments({
      assignedTo: userId,
      isDeleted: false,
      status: { $nin: ['won', 'lost', 'archived'] },
    });

    // Count open tasks
    const openTasks = await this.taskModel.countDocuments({
      assignedTo: userId,
      isDeleted: false,
      status: { $in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
    });

    // Count overdue tasks
    const overdueTasks = await this.taskModel.countDocuments({
      assignedTo: userId,
      isDeleted: false,
      status: { $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      dueDate: { $lt: new Date() },
    });

    // Calculate score: lower is better
    // Formula: activeLeads * 2 + openTasks + overdueTasks * 3
    const score = (activeLeads * 2) + openTasks + (overdueTasks * 3);

    return {
      managerId: userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      activeLeads,
      openTasks,
      overdueTasks,
      score,
      isAvailable: user.isAvailableForAssignment !== false,
      maxActiveLeads: user.maxActiveLeads,
      supportedMarkets: user.supportedMarkets,
      supportedLanguages: user.supportedLanguages,
      supportedSources: user.supportedSources,
      lastAssignedAt: user.lastAssignedAt,
      assignmentPriority: user.assignmentPriority,
    };
  }

  /**
   * Get workload for a specific manager
   */
  async getManagerWorkload(managerId: string): Promise<ManagerWorkload | null> {
    const user = await this.userModel.findOne({ 
      id: managerId,
      isDeleted: false 
    }).lean();
    
    if (!user) return null;
    return this.calculateWorkload(user);
  }

  /**
   * Check if manager has capacity for new lead
   */
  async hasCapacity(managerId: string, maxLeads?: number): Promise<boolean> {
    const workload = await this.getManagerWorkload(managerId);
    if (!workload) return false;

    const limit = maxLeads || workload.maxActiveLeads;
    if (!limit) return true; // No limit set

    return workload.activeLeads < limit;
  }

  /**
   * Get fallback manager (typically head sales or admin)
   */
  async getFallbackManager(): Promise<ManagerWorkload | null> {
    // Try to find admin or head role who is available
    const adminUser = await this.userModel.findOne({
      isDeleted: false,
      isActive: true,
      role: { $in: [UserRole.TEAM_LEAD, UserRole.OWNER] },
    }).sort({ lastAssignedAt: 1 }).lean();

    if (adminUser) {
      return this.calculateWorkload(adminUser);
    }

    // Fallback: any active manager with lowest workload
    const managers = await this.getEligibleManagers({} as RoutingContext, {
      onlyAvailable: false, // Include unavailable as last resort
    });

    if (managers.length === 0) return null;

    // Sort by score and return least loaded
    managers.sort((a, b) => a.score - b.score);
    return managers[0];
  }
}
