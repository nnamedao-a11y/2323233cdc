import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../../leads/lead.schema';
import { AssignmentHistory } from '../schemas/assignment-history.schema';
import { RoutingRule } from '../schemas/routing-rule.schema';
import { ManagerAvailabilityService } from './manager-availability.service';
import { LeadRoutingStrategyService } from './lead-routing-strategy.service';
import { RoutingRulesService } from './routing-rules.service';
import { TasksService } from '../../tasks/tasks.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AssignmentStrategy, AssignmentReason, AssignmentTrigger } from '../enums/assignment.enum';
import { 
  RoutingContext, 
  AssignmentResult, 
  FinalizeAssignmentParams,
  ManagerWorkload 
} from '../interfaces/routing.interface';
import { AssignLeadDto, ReassignLeadDto } from '../dto/routing.dto';
import { generateId, toObjectResponse, toArrayResponse } from '../../../shared/utils';
import { NotificationType, AuditAction, EntityType, AutomationTrigger } from '../../../shared/enums';

@Injectable()
export class LeadRoutingService {
  private readonly logger = new Logger(LeadRoutingService.name);

  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(AssignmentHistory.name) private historyModel: Model<AssignmentHistory>,
    private managerAvailabilityService: ManagerAvailabilityService,
    private strategyService: LeadRoutingStrategyService,
    private rulesService: RoutingRulesService,
    @Inject(forwardRef(() => TasksService)) private tasksService: TasksService,
    private notificationsService: NotificationsService,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Main entry point: Assign a lead to a manager
   */
  async assignLead(leadId: string, dto?: AssignLeadDto): Promise<AssignmentResult> {
    this.logger.log(`Assigning lead: ${leadId}`);

    // Get lead
    const lead = await this.leadModel.findOne({ id: leadId, isDeleted: false });
    if (!lead) {
      throw new NotFoundException(`Lead ${leadId} not found`);
    }

    // Check if already assigned (unless force reassign)
    if (lead.assignedTo && !dto?.forceManagerId) {
      this.logger.warn(`Lead ${leadId} already assigned to ${lead.assignedTo}`);
      return {
        success: false,
        strategy: AssignmentStrategy.MANUAL,
        reason: 'Lead already assigned. Use reassign endpoint to change.',
        error: 'ALREADY_ASSIGNED',
      };
    }

    // If forced manager specified
    if (dto?.forceManagerId) {
      return this.assignToSpecificManager(lead, dto.forceManagerId, dto.reason || 'Force assigned');
    }

    // Build routing context
    const context = this.buildRoutingContext(lead);

    // Find matching rule
    const rule = await this.rulesService.findMatchingRule(context);
    if (!rule) {
      this.logger.warn(`No routing rule found for lead ${leadId}, using fallback`);
      return this.assignToFallback(lead, 'No matching routing rule');
    }

    // Get eligible managers based on rule
    const managers = await this.managerAvailabilityService.getEligibleManagers(context, {
      allowedRoles: rule.allowedRoleKeys,
      onlyAvailable: rule.onlyAvailableManagers,
      maxActiveLeads: rule.maxActiveLeadsPerManager,
      supportedMarkets: rule.supportedMarkets,
      supportedLanguages: rule.supportedLanguages,
      supportedSources: rule.supportedSources,
    });

    if (managers.length === 0) {
      this.logger.warn(`No eligible managers for lead ${leadId}`);
      
      if (rule.useFallbackQueue) {
        return this.addToFallbackQueue(lead, 'No eligible managers');
      }
      
      if (rule.fallbackManagerId) {
        return this.assignToSpecificManager(
          lead, 
          rule.fallbackManagerId, 
          'Fallback manager (no eligible)',
          AssignmentStrategy.FALLBACK
        );
      }

      return this.assignToFallback(lead, 'No eligible managers and no fallback configured');
    }

    // Select manager using strategy
    const strategy = dto?.strategy || rule.strategy || AssignmentStrategy.LEAST_LOADED;
    const selectedManager = this.strategyService.select(strategy, managers);

    if (!selectedManager) {
      return this.assignToFallback(lead, 'Strategy selection failed');
    }

    // Finalize assignment
    const result = await this.finalizeAssignment({
      leadId: lead.id,
      managerId: selectedManager.managerId,
      strategy,
      reason: `Auto-assigned by rule: ${rule.name}`,
      triggeredBy: 'system',
      leadSnapshot: {
        source: lead.source,
        status: lead.status,
        contactStatus: lead.contactStatus,
      },
      managerLoadSnapshot: {
        newManagerActiveLeads: selectedManager.activeLeads,
        newManagerOpenTasks: selectedManager.openTasks,
        newManagerOverdueTasks: selectedManager.overdueTasks,
      },
    });

    // Calculate SLA deadline
    const slaMinutes = rule.firstResponseSlaMinutes || 10;
    await this.leadModel.findOneAndUpdate(
      { id: leadId },
      { 
        $set: { 
          firstResponseDueAt: new Date(Date.now() + slaMinutes * 60 * 1000),
          isOverdueForFirstResponse: false,
        } 
      },
    );

    return {
      success: true,
      managerId: selectedManager.managerId,
      managerName: `${selectedManager.firstName} ${selectedManager.lastName}`,
      strategy,
      reason: `Auto-assigned by rule: ${rule.name}`,
      historyId: result.historyId,
    };
  }

  /**
   * Reassign lead to different manager (manual)
   */
  async reassignLead(leadId: string, dto: ReassignLeadDto, userId: string): Promise<AssignmentResult> {
    const lead = await this.leadModel.findOne({ id: leadId, isDeleted: false });
    if (!lead) {
      throw new NotFoundException(`Lead ${leadId} not found`);
    }

    const previousManagerId = lead.assignedTo;

    // Get new manager workload
    const newManagerWorkload = await this.managerAvailabilityService.getManagerWorkload(dto.newManagerId);
    if (!newManagerWorkload) {
      throw new BadRequestException(`Manager ${dto.newManagerId} not found or inactive`);
    }

    // Check capacity
    const hasCapacity = await this.managerAvailabilityService.hasCapacity(dto.newManagerId);
    if (!hasCapacity) {
      throw new BadRequestException(`Manager ${dto.newManagerId} has reached capacity limit`);
    }

    // Get previous manager workload for snapshot
    let previousManagerWorkload: ManagerWorkload | null = null;
    if (previousManagerId) {
      previousManagerWorkload = await this.managerAvailabilityService.getManagerWorkload(previousManagerId);
    }

    // Increment reassign count
    const reassignedCount = (lead.reassignedCount || 0) + 1;

    // Finalize
    const result = await this.finalizeAssignment({
      leadId,
      managerId: dto.newManagerId,
      previousManagerId,
      strategy: AssignmentStrategy.MANUAL,
      reason: dto.reason,
      triggeredBy: 'admin',
      triggeredByUserId: userId,
      leadSnapshot: {
        source: lead.source,
        status: lead.status,
        contactStatus: lead.contactStatus,
      },
      managerLoadSnapshot: {
        previousManagerActiveLeads: previousManagerWorkload?.activeLeads,
        newManagerActiveLeads: newManagerWorkload.activeLeads,
        newManagerOpenTasks: newManagerWorkload.openTasks,
        newManagerOverdueTasks: newManagerWorkload.overdueTasks,
      },
    });

    // Update reassign count
    await this.leadModel.findOneAndUpdate(
      { id: leadId },
      { $set: { reassignedCount } },
    );

    return {
      success: true,
      managerId: dto.newManagerId,
      managerName: `${newManagerWorkload.firstName} ${newManagerWorkload.lastName}`,
      strategy: AssignmentStrategy.MANUAL,
      reason: dto.reason,
      historyId: result.historyId,
    };
  }

  /**
   * Reassign lead due to SLA overdue
   */
  async reassignIfFirstResponseOverdue(leadId: string): Promise<AssignmentResult | null> {
    const lead = await this.leadModel.findOne({ id: leadId, isDeleted: false });
    if (!lead) return null;

    // Check if SLA is overdue
    if (!lead.firstResponseDueAt || lead.firstResponseAt) {
      return null; // Not applicable or already responded
    }

    if (new Date() < lead.firstResponseDueAt) {
      return null; // Not overdue yet
    }

    // Check reassign limit (max 2 auto-reassigns)
    const reassignedCount = lead.reassignedCount || 0;
    if (reassignedCount >= 2) {
      this.logger.warn(`Lead ${leadId} exceeded reassign limit, adding to fallback queue`);
      return this.addToFallbackQueue(lead, 'SLA overdue, max reassigns reached');
    }

    // Mark as overdue
    await this.leadModel.findOneAndUpdate(
      { id: leadId },
      { $set: { isOverdueForFirstResponse: true } },
    );

    // Get new manager (exclude current)
    const context = this.buildRoutingContext(lead);
    const managers = await this.managerAvailabilityService.getEligibleManagers(context);
    const filteredManagers = managers.filter(m => m.managerId !== lead.assignedTo);

    if (filteredManagers.length === 0) {
      return this.addToFallbackQueue(lead, 'SLA overdue, no other managers available');
    }

    const selectedManager = this.strategyService.selectLeastLoaded(filteredManagers);
    if (!selectedManager) {
      return this.addToFallbackQueue(lead, 'SLA overdue, selection failed');
    }

    // Finalize reassignment
    const result = await this.finalizeAssignment({
      leadId,
      managerId: selectedManager.managerId,
      previousManagerId: lead.assignedTo,
      strategy: AssignmentStrategy.OVERDUE_REASSIGN,
      reason: 'First response SLA overdue',
      triggeredBy: 'automation',
      managerLoadSnapshot: {
        newManagerActiveLeads: selectedManager.activeLeads,
        newManagerOpenTasks: selectedManager.openTasks,
        newManagerOverdueTasks: selectedManager.overdueTasks,
      },
    });

    // Update reassign count and reset SLA
    await this.leadModel.findOneAndUpdate(
      { id: leadId },
      { 
        $inc: { reassignedCount: 1 },
        $set: { 
          firstResponseDueAt: new Date(Date.now() + 10 * 60 * 1000), // New 10 min SLA
          isOverdueForFirstResponse: false,
        }
      },
    );

    // Alert admin
    await this.notificationsService.create({
      userId: 'system', // Will be replaced with actual admin lookup
      type: NotificationType.SYSTEM,
      title: 'Lead SLA Breach - Auto Reassigned',
      message: `Lead ${lead.firstName} ${lead.lastName} was auto-reassigned due to SLA breach`,
      entityType: 'lead',
      entityId: leadId,
    });

    return {
      success: true,
      managerId: selectedManager.managerId,
      managerName: `${selectedManager.firstName} ${selectedManager.lastName}`,
      strategy: AssignmentStrategy.OVERDUE_REASSIGN,
      reason: 'Auto-reassigned due to first response SLA overdue',
      historyId: result.historyId,
    };
  }

  /**
   * Assign to specific manager
   */
  private async assignToSpecificManager(
    lead: Lead,
    managerId: string,
    reason: string,
    strategy: AssignmentStrategy = AssignmentStrategy.MANUAL,
  ): Promise<AssignmentResult> {
    const manager = await this.managerAvailabilityService.getManagerWorkload(managerId);
    if (!manager) {
      throw new BadRequestException(`Manager ${managerId} not found`);
    }

    const result = await this.finalizeAssignment({
      leadId: lead.id,
      managerId,
      previousManagerId: lead.assignedTo,
      strategy,
      reason,
      triggeredBy: 'system',
      managerLoadSnapshot: {
        newManagerActiveLeads: manager.activeLeads,
        newManagerOpenTasks: manager.openTasks,
        newManagerOverdueTasks: manager.overdueTasks,
      },
    });

    return {
      success: true,
      managerId,
      managerName: `${manager.firstName} ${manager.lastName}`,
      strategy,
      reason,
      historyId: result.historyId,
    };
  }

  /**
   * Assign to fallback manager
   */
  private async assignToFallback(lead: Lead, reason: string): Promise<AssignmentResult> {
    const fallbackManager = await this.managerAvailabilityService.getFallbackManager();
    
    if (!fallbackManager) {
      return this.addToFallbackQueue(lead, `${reason} - No fallback manager available`);
    }

    const result = await this.finalizeAssignment({
      leadId: lead.id,
      managerId: fallbackManager.managerId,
      previousManagerId: lead.assignedTo,
      strategy: AssignmentStrategy.FALLBACK,
      reason: `Fallback: ${reason}`,
      triggeredBy: 'system',
      managerLoadSnapshot: {
        newManagerActiveLeads: fallbackManager.activeLeads,
        newManagerOpenTasks: fallbackManager.openTasks,
        newManagerOverdueTasks: fallbackManager.overdueTasks,
      },
    });

    return {
      success: true,
      managerId: fallbackManager.managerId,
      managerName: `${fallbackManager.firstName} ${fallbackManager.lastName}`,
      strategy: AssignmentStrategy.FALLBACK,
      reason: `Fallback assignment: ${reason}`,
      historyId: result.historyId,
      isFallback: true,
    };
  }

  /**
   * Add lead to fallback queue for manual assignment
   */
  private async addToFallbackQueue(lead: Lead, reason: string): Promise<AssignmentResult> {
    const history = new this.historyModel({
      id: generateId(),
      leadId: lead.id,
      previousManagerId: lead.assignedTo,
      newManagerId: null,
      strategy: AssignmentStrategy.FALLBACK,
      reason: `Fallback Queue: ${reason}`,
      triggeredBy: AssignmentTrigger.SYSTEM,
      isFallbackQueue: true,
      leadSnapshot: {
        source: lead.source,
        status: lead.status,
        contactStatus: lead.contactStatus,
      },
    });
    await history.save();

    // Send notification to admins
    await this.notificationsService.create({
      userId: 'system',
      type: NotificationType.SYSTEM,
      title: 'Lead in Fallback Queue',
      message: `Lead ${lead.firstName} ${lead.lastName} needs manual assignment: ${reason}`,
      entityType: 'lead',
      entityId: lead.id,
    });

    this.logger.warn(`Lead ${lead.id} added to fallback queue: ${reason}`);

    return {
      success: false,
      strategy: AssignmentStrategy.FALLBACK,
      reason: `Added to fallback queue: ${reason}`,
      historyId: history.id,
      isFallbackQueue: true,
    };
  }

  /**
   * Finalize assignment: update lead, counters, history, create task, send notification
   */
  private async finalizeAssignment(params: FinalizeAssignmentParams): Promise<{ historyId: string }> {
    const { leadId, managerId, previousManagerId, strategy, reason, triggeredBy, triggeredByUserId, leadSnapshot, managerLoadSnapshot } = params;

    // 1. Update lead
    await this.leadModel.findOneAndUpdate(
      { id: leadId },
      {
        $set: {
          assignedTo: managerId,
          assignedAt: new Date(),
          assignmentStrategy: strategy,
          assignmentReason: reason,
        },
      },
    );

    // 2. Update manager's lastAssignedAt
    // Note: We'd need UserModel injection to do this properly
    // For now, we'll skip this as it requires schema changes

    // 3. Write assignment history
    const history = new this.historyModel({
      id: generateId(),
      leadId,
      previousManagerId,
      newManagerId: managerId,
      strategy,
      reason,
      triggeredBy,
      triggeredByUserId,
      leadSnapshot,
      managerLoadSnapshot,
    });
    await history.save();

    // 4. Create first contact task
    const lead = await this.leadModel.findOne({ id: leadId });
    if (lead) {
      await this.tasksService.create({
        title: `Зв'язатися: ${lead.firstName} ${lead.lastName}`,
        description: `Перший контакт з клієнтом. Телефон: ${lead.phone || 'не вказано'}. Email: ${lead.email}`,
        priority: 'high',
        dueDate: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        assignedTo: managerId,
        relatedEntityType: 'lead',
        relatedEntityId: leadId,
        isReminder: true,
      }, 'system');
    }

    // 5. Send notification to manager
    await this.notificationsService.create({
      userId: managerId,
      type: NotificationType.LEAD_ASSIGNED,
      title: 'Новий лід призначено',
      message: `Вам призначено лід: ${lead?.firstName} ${lead?.lastName}`,
      entityType: 'lead',
      entityId: leadId,
    });

    // 6. Audit log
    await this.auditLogService.log({
      action: AuditAction.ASSIGN,
      entityType: EntityType.LEAD,
      entityId: leadId,
      userId: triggeredByUserId || 'system',
      details: {
        strategy,
        reason,
        previousManagerId,
        newManagerId: managerId,
      },
    });

    this.logger.log(`Lead ${leadId} assigned to ${managerId} via ${strategy}`);

    return { historyId: history.id };
  }

  /**
   * Build routing context from lead
   */
  private buildRoutingContext(lead: Lead): RoutingContext {
    return {
      leadId: lead.id,
      source: lead.source,
      createdAt: lead['createdAt'] || new Date(),
      // TODO: Add market, language, leadType when available in lead schema
    };
  }

  /**
   * Get assignment history for a lead
   */
  async getHistory(leadId: string): Promise<any[]> {
    const history = await this.historyModel
      .find({ leadId })
      .sort({ createdAt: -1 })
      .limit(50);
    return toArrayResponse(history);
  }

  /**
   * Get fallback queue items
   */
  async getFallbackQueue(): Promise<any[]> {
    const items = await this.historyModel
      .find({ isFallbackQueue: true, fallbackResolvedAt: null })
      .sort({ createdAt: 1 });
    return toArrayResponse(items);
  }

  /**
   * Resolve fallback queue item
   */
  async resolveFallbackQueueItem(historyId: string, managerId: string, userId: string): Promise<AssignmentResult> {
    const item = await this.historyModel.findOne({ id: historyId, isFallbackQueue: true });
    if (!item) {
      throw new NotFoundException('Fallback queue item not found');
    }

    if (item.fallbackResolvedAt) {
      throw new BadRequestException('Item already resolved');
    }

    // Get lead and assign
    const lead = await this.leadModel.findOne({ id: item.leadId, isDeleted: false });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // Assign to specified manager
    const result = await this.assignToSpecificManager(lead, managerId, `Fallback queue resolved by admin`);

    // Mark as resolved
    await this.historyModel.findOneAndUpdate(
      { id: historyId },
      { $set: { fallbackResolvedAt: new Date(), fallbackResolvedBy: userId } },
    );

    return result;
  }

  /**
   * Get manager workload matrix (for dashboard)
   */
  async getWorkloadMatrix(): Promise<{
    managers: ManagerWorkload[];
    stats: any;
  }> {
    const managers = await this.managerAvailabilityService.getEligibleManagers({} as RoutingContext, {
      onlyAvailable: false,
    });

    const stats = this.strategyService.calculatePoolStats(managers);

    return {
      managers: this.strategyService.getSortedByWorkload(managers),
      stats,
    };
  }
}
