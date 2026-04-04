import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EscalationRun, EscalationRunDocument } from './schemas/escalation-run.schema';
import { EventBusService } from '../event-bus/event-bus.service';

// Default rules for escalation
const DEFAULT_RULES: Record<string, any> = {
  'lead.hot_not_contacted': {
    eventType: 'lead.hot_not_contacted',
    isActive: true,
    managerTimeoutMinutes: 15,
    teamLeadTimeoutMinutes: 45,
    escalateToTeamLead: true,
    escalateToOwner: true,
    severity: 'critical',
    createTaskOnEscalation: true,
  },
  'invoice.overdue': {
    eventType: 'invoice.overdue',
    isActive: true,
    managerTimeoutMinutes: 60,
    teamLeadTimeoutMinutes: 180,
    escalateToTeamLead: true,
    escalateToOwner: true,
    severity: 'critical',
    createTaskOnEscalation: true,
  },
  'shipment.stalled': {
    eventType: 'shipment.stalled',
    isActive: true,
    managerTimeoutMinutes: 60,
    teamLeadTimeoutMinutes: 240,
    escalateToTeamLead: true,
    escalateToOwner: true,
    severity: 'critical',
    createTaskOnEscalation: true,
  },
  'shipment.tracking_missing': {
    eventType: 'shipment.tracking_missing',
    isActive: true,
    managerTimeoutMinutes: 120,
    teamLeadTimeoutMinutes: 360,
    escalateToTeamLead: true,
    escalateToOwner: true,
    severity: 'warning',
    createTaskOnEscalation: true,
  },
  'payment.failed': {
    eventType: 'payment.failed',
    isActive: true,
    managerTimeoutMinutes: 30,
    teamLeadTimeoutMinutes: 90,
    escalateToTeamLead: true,
    escalateToOwner: true,
    severity: 'critical',
    createTaskOnEscalation: true,
  },
  'staff.session_suspicious': {
    eventType: 'staff.session_suspicious',
    isActive: true,
    managerTimeoutMinutes: 5,
    teamLeadTimeoutMinutes: 15,
    escalateToTeamLead: false,
    escalateToOwner: true,
    severity: 'critical',
    createTaskOnEscalation: false,
  },
};

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    @InjectModel(EscalationRun.name)
    private escalationRunModel: Model<EscalationRunDocument>,
    private readonly eventBus: EventBusService,
  ) {}

  async startEscalation(input: {
    eventType: string;
    entityType: string;
    entityId: string;
    managerId?: string;
    teamLeadId?: string;
    meta?: Record<string, any>;
  }) {
    const rule = this.getRule(input.eventType);
    if (!rule || !rule.isActive) {
      this.logger.debug(`No active rule for ${input.eventType}`);
      return null;
    }

    // Check if already exists
    const existing = await this.escalationRunModel.findOne({
      eventType: input.eventType,
      entityId: input.entityId,
      status: { $in: ['manager_pending', 'teamlead_pending', 'owner_pending'] },
    });
    
    if (existing) {
      this.logger.debug(`Escalation already exists for ${input.eventType}:${input.entityId}`);
      return existing;
    }

    const now = Date.now();
    const run = new this.escalationRunModel({
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      managerId: input.managerId,
      teamLeadId: input.teamLeadId,
      status: 'manager_pending',
      escalationLevel: 0,
      managerDeadlineAt: new Date(now + rule.managerTimeoutMinutes * 60 * 1000),
      teamLeadDeadlineAt: new Date(now + rule.teamLeadTimeoutMinutes * 60 * 1000),
      meta: input.meta || {},
    });

    await run.save();
    this.logger.log(`Started escalation ${run._id} for ${input.eventType}`);

    await this.eventBus.emit({
      type: 'escalation.started',
      aggregateType: input.entityType,
      aggregateId: input.entityId,
      payload: {
        escalationRunId: run._id.toString(),
        eventType: input.eventType,
        managerId: input.managerId,
        deadline: run.managerDeadlineAt,
      },
      actorType: 'system',
      source: 'api',
    });

    return run;
  }

  async resolveEscalation(input: {
    eventType: string;
    entityId: string;
    userId: string;
    reason?: string;
  }) {
    const run = await this.escalationRunModel.findOne({
      eventType: input.eventType,
      entityId: input.entityId,
      status: { $in: ['manager_pending', 'teamlead_pending', 'owner_pending'] },
    });

    if (!run) return null;

    run.status = 'resolved';
    run.resolvedAt = new Date();
    run.resolvedByUserId = input.userId as any;
    run.resolvedReason = input.reason || 'resolved_manually';
    await run.save();

    this.logger.log(`Resolved escalation ${run._id} by ${input.userId}`);

    await this.eventBus.emit({
      type: 'escalation.resolved',
      aggregateType: run.entityType,
      aggregateId: run.entityId,
      payload: {
        escalationRunId: run._id.toString(),
        eventType: run.eventType,
        resolvedByUserId: input.userId,
        reason: input.reason,
      },
      actorType: 'system',
      source: 'api',
    });

    return run;
  }

  async processEscalations() {
    const now = new Date();

    // Find manager-level escalations past deadline
    const managerDue = await this.escalationRunModel.find({
      status: 'manager_pending',
      managerDeadlineAt: { $lte: now },
    }).limit(100);

    for (const run of managerDue) {
      await this.escalateToTeamLead(run);
    }

    // Find team-lead-level escalations past deadline
    const teamLeadDue = await this.escalationRunModel.find({
      status: 'teamlead_pending',
      teamLeadDeadlineAt: { $lte: now },
    }).limit(100);

    for (const run of teamLeadDue) {
      await this.escalateToOwner(run);
    }

    return { managerEscalated: managerDue.length, ownerEscalated: teamLeadDue.length };
  }

  private async escalateToTeamLead(run: EscalationRunDocument) {
    const rule = this.getRule(run.eventType);
    if (!rule?.escalateToTeamLead) return;

    run.status = 'teamlead_pending';
    run.escalationLevel = 1;
    await run.save();

    this.logger.warn(`Escalated ${run._id} to Team Lead`);

    await this.eventBus.emit({
      type: 'escalation.teamlead_required',
      aggregateType: run.entityType,
      aggregateId: run.entityId,
      payload: {
        escalationRunId: run._id.toString(),
        eventType: run.eventType,
        teamLeadId: run.teamLeadId?.toString(),
        managerId: run.managerId?.toString(),
        severity: 'warning',
      },
      actorType: 'system',
      source: 'cron',
    });

    if (rule.createTaskOnEscalation) {
      await this.eventBus.emit({
        type: 'task.auto_created',
        aggregateType: run.entityType,
        aggregateId: run.entityId,
        payload: {
          taskType: 'escalation_review',
          priority: 'critical',
          title: `Escalation: ${run.eventType}`,
          assigneeId: run.teamLeadId?.toString(),
          entityId: run.entityId,
          entityType: run.entityType,
        },
        actorType: 'system',
        source: 'cron',
      });
    }
  }

  private async escalateToOwner(run: EscalationRunDocument) {
    const rule = this.getRule(run.eventType);
    if (!rule?.escalateToOwner) return;

    run.status = 'owner_pending';
    run.escalationLevel = 2;
    await run.save();

    this.logger.error(`Escalated ${run._id} to OWNER - critical`);

    await this.eventBus.emit({
      type: 'escalation.owner_required',
      aggregateType: run.entityType,
      aggregateId: run.entityId,
      payload: {
        escalationRunId: run._id.toString(),
        eventType: run.eventType,
        managerId: run.managerId?.toString(),
        teamLeadId: run.teamLeadId?.toString(),
        severity: 'critical',
      },
      actorType: 'system',
      source: 'cron',
    });
  }

  async getActiveEscalations(filters?: { status?: string; entityType?: string }) {
    const query: any = {
      status: { $in: ['manager_pending', 'teamlead_pending', 'owner_pending'] },
    };
    
    if (filters?.status) query.status = filters.status;
    if (filters?.entityType) query.entityType = filters.entityType;

    return this.escalationRunModel.find(query).sort({ createdAt: -1 }).limit(100);
  }

  async getEscalationStats() {
    const [managerPending, teamLeadPending, ownerPending, resolvedToday] = await Promise.all([
      this.escalationRunModel.countDocuments({ status: 'manager_pending' }),
      this.escalationRunModel.countDocuments({ status: 'teamlead_pending' }),
      this.escalationRunModel.countDocuments({ status: 'owner_pending' }),
      this.escalationRunModel.countDocuments({
        status: 'resolved',
        resolvedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    return { managerPending, teamLeadPending, ownerPending, resolvedToday };
  }

  private getRule(eventType: string) {
    return DEFAULT_RULES[eventType] || null;
  }
}
