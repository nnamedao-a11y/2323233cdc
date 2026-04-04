/**
 * BIBI Cars - Routing Service
 * Zoho-style lead auto-assignment engine
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventBusService } from '../event-bus/event-bus.service';
import { EventTypes } from '../../common/events/system-event.interface';
import { LeadRoutingRule, LeadRoutingRuleDocument } from './schemas/lead-routing-rule.schema';
import { RoutingQueueEntry, RoutingQueueEntryDocument } from './schemas/routing-queue-entry.schema';

export interface ManagerCapacity {
  managerId: string;
  activeLeads: number;
  hotLeads: number;
  overdueTasks: number;
  available: boolean;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    @InjectModel(LeadRoutingRule.name) private ruleModel: Model<LeadRoutingRuleDocument>,
    @InjectModel(RoutingQueueEntry.name) private queueModel: Model<RoutingQueueEntryDocument>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Route a new lead to appropriate manager/team
   */
  async routeLead(lead: any): Promise<any> {
    this.logger.log(`Routing lead ${lead.id || lead._id}`);

    const rules = await this.getActiveRules();

    for (const rule of rules) {
      const matched = this.matchRule(rule, lead);
      if (!matched) continue;

      this.logger.log(`Rule matched: ${rule.name}`);

      if (rule.assignToType === 'manager') {
        const managerId = await this.resolveManager(rule, lead);

        if (managerId) {
          return this.assignLead(lead, {
            type: 'manager',
            id: managerId,
            rule,
          });
        }
      }

      if (rule.assignToType === 'team') {
        const managerId = await this.resolveManagerFromTeam(rule.assignToId, lead, rule);
        if (managerId) {
          return this.assignLead(lead, {
            type: 'manager',
            id: managerId,
            rule,
          });
        }
      }

      if (rule.assignToType === 'queue') {
        return this.sendToQueue(lead, rule.assignToId || 'custom_queue', `rule:${rule.name}`);
      }
    }

    // No rule matched - send to default queue
    this.logger.log(`No rule matched for lead ${lead.id}, sending to default queue`);
    return this.sendToDefaultQueue(lead);
  }

  /**
   * Reassign stale lead to another manager
   */
  async reassignStaleLead(lead: any): Promise<any> {
    const currentManagerId = lead.assignedTo;

    const nextManagerId = await this.findAlternativeManager(lead, currentManagerId);

    if (!nextManagerId) {
      await this.eventBus.emit({
        type: EventTypes.ROUTING_FALLBACK_QUEUE,
        aggregateType: 'lead',
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          reason: 'no_alternative_manager',
        },
        actorType: 'system',
        source: 'cron',
      });

      return this.sendToQueue(lead, 'stale_queue', 'no_alternative_manager');
    }

    // Update lead
    await this.leadModel.updateOne(
      { id: lead.id },
      {
        $set: {
          assignedTo: nextManagerId,
          assignmentStrategy: 'stale_reassignment',
          assignmentReason: `Reassigned from ${currentManagerId}`,
        },
        $inc: { reassignedCount: 1 },
      }
    );

    await this.eventBus.emit({
      type: EventTypes.LEAD_REASSIGNED,
      aggregateType: 'lead',
      aggregateId: lead.id,
      payload: {
        leadId: lead.id,
        fromManagerId: currentManagerId,
        toManagerId: nextManagerId,
        reason: 'stale_lead',
      },
      actorType: 'system',
      source: 'cron',
    });

    this.logger.log(`Lead ${lead.id} reassigned from ${currentManagerId} to ${nextManagerId}`);

    return { ...lead, assignedTo: nextManagerId };
  }

  /**
   * Claim lead from queue
   */
  async claimFromQueue(queueName: string, managerId: string): Promise<any> {
    const entry = await this.queueModel.findOneAndUpdate(
      { queueName, status: 'pending' },
      {
        $set: {
          status: 'assigned',
          assignedTo: managerId,
          assignedAt: new Date(),
        },
      },
      { new: true, sort: { createdAt: 1 } }
    );

    if (!entry) return null;

    // Update lead
    await this.leadModel.updateOne(
      { id: entry.leadId },
      {
        $set: {
          assignedTo: managerId,
          assignmentStrategy: 'queue_claim',
          assignmentReason: `Claimed from ${queueName}`,
        },
      }
    );

    await this.eventBus.emit({
      type: EventTypes.LEAD_ASSIGNED,
      aggregateType: 'lead',
      aggregateId: entry.leadId,
      payload: {
        leadId: entry.leadId,
        managerId,
        source: 'queue_claim',
        queueName,
      },
      actorType: 'manager',
      actorId: managerId,
      source: 'api',
    });

    return entry;
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<any> {
    const stats = await this.queueModel.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: '$queueName', count: { $sum: 1 } } },
    ]);

    return stats.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {});
  }

  /**
   * Get stale leads for reassignment
   */
  async getStaleLeads(staleMinutes: number = 30): Promise<any[]> {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);

    return this.leadModel.find({
      isDeleted: false,
      assignedTo: { $exists: true, $ne: null },
      lastContactAt: { $exists: false },
      firstResponseAt: { $exists: false },
      assignedAt: { $lt: cutoff },
      status: { $in: ['new', 'contacted'] },
    }).lean();
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════

  private async assignLead(
    lead: any,
    input: { type: 'manager'; id: string; rule: any },
  ): Promise<any> {
    const leadId = lead.id || lead._id?.toString();

    // Update lead in DB
    await this.leadModel.updateOne(
      { $or: [{ id: leadId }, { _id: leadId }] },
      {
        $set: {
          assignedTo: input.id,
          assignedAt: new Date(),
          assignmentStrategy: 'auto_routing',
          assignmentReason: `Rule: ${input.rule.name}`,
          firstResponseDueAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min SLA
        },
      }
    );

    await this.eventBus.emit({
      type: EventTypes.ROUTING_RULE_MATCHED,
      aggregateType: 'lead',
      aggregateId: leadId,
      payload: {
        leadId,
        ruleId: input.rule._id?.toString(),
        ruleName: input.rule.name,
      },
      actorType: 'system',
      source: 'api',
    });

    await this.eventBus.emit({
      type: EventTypes.LEAD_ASSIGNED,
      aggregateType: 'lead',
      aggregateId: leadId,
      payload: {
        leadId,
        managerId: input.id,
        source: 'auto_routing',
      },
      actorType: 'system',
      source: 'api',
    });

    this.logger.log(`Lead ${leadId} assigned to manager ${input.id}`);

    return { ...lead, assignedTo: input.id, routedAt: new Date() };
  }

  private async sendToQueue(lead: any, queueName: string, reason: string): Promise<any> {
    const leadId = lead.id || lead._id?.toString();

    await this.queueModel.create({
      leadId,
      queueName,
      status: 'pending',
      reason,
    });

    await this.eventBus.emit({
      type: EventTypes.ROUTING_FALLBACK_QUEUE,
      aggregateType: 'lead',
      aggregateId: leadId,
      payload: {
        leadId,
        queueName,
        reason,
      },
      actorType: 'system',
      source: 'api',
    });

    this.logger.log(`Lead ${leadId} sent to queue ${queueName}: ${reason}`);

    return { ...lead, queue: queueName };
  }

  private async sendToDefaultQueue(lead: any): Promise<any> {
    return this.sendToQueue(lead, 'default_queue', 'no_rule_matched');
  }

  private matchRule(rule: LeadRoutingRuleDocument, lead: any): boolean {
    const c = rule.conditions || {};

    if (c.source && lead.source !== c.source) return false;
    if (c.country && lead.country !== c.country) return false;
    if (c.language && lead.language !== c.language) return false;
    if (c.vehicleType && lead.vehicleType !== c.vehicleType) return false;
    if (c.intentLevel && lead.intentLevel !== c.intentLevel) return false;
    if (typeof c.budgetMin === 'number' && (lead.price || 0) < c.budgetMin) return false;
    if (typeof c.budgetMax === 'number' && (lead.price || 0) > c.budgetMax) return false;

    return true;
  }

  private async resolveManager(rule: LeadRoutingRuleDocument, lead: any): Promise<string | null> {
    if (!rule.useCapacityCheck) return rule.assignToId || null;

    if (!rule.assignToId) return null;

    const cap = await this.getManagerCapacity(rule.assignToId);
    if (!cap.available) {
      this.logger.log(`Manager ${rule.assignToId} not available (capacity: ${cap.activeLeads})`);
      return null;
    }

    return rule.assignToId;
  }

  private async resolveManagerFromTeam(teamLeadId: string | undefined, lead: any, rule: LeadRoutingRuleDocument): Promise<string | null> {
    if (!teamLeadId) return null;

    const managers = await this.getTeamManagers(teamLeadId);

    if (!managers.length) {
      this.logger.log(`No managers found in team ${teamLeadId}`);
      return null;
    }

    const capacities = await Promise.all(
      managers.map((m) => this.getManagerCapacity(m.id)),
    );

    const available = capacities
      .filter((c) => c.available)
      .sort((a, b) => a.activeLeads - b.activeLeads);

    if (!available.length) {
      this.logger.log(`All managers in team ${teamLeadId} are at capacity`);
      return null;
    }

    // Return manager with least active leads (load balancing)
    return available[0].managerId;
  }

  private async findAlternativeManager(lead: any, excludeManagerId: string): Promise<string | null> {
    // Get all active managers
    const managers = await this.userModel.find({
      role: 'manager',
      isActive: { $ne: false },
      _id: { $ne: excludeManagerId },
    }).lean();

    if (!managers.length) return null;

    const capacities = await Promise.all(
      managers.map((m: any) => this.getManagerCapacity(m._id?.toString() || m.id)),
    );

    const available = capacities
      .filter((c) => c.available)
      .sort((a, b) => a.activeLeads - b.activeLeads);

    return available[0]?.managerId || null;
  }

  private async getActiveRules(): Promise<any[]> {
    return this.ruleModel
      .find({ isActive: true })
      .sort({ priority: 1 })
      .lean();
  }

  private async getTeamManagers(teamLeadId: string): Promise<any[]> {
    return this.userModel
      .find({
        role: 'manager',
        teamLeadId,
        isActive: { $ne: false },
      })
      .lean();
  }

  private async getManagerCapacity(managerId: string): Promise<ManagerCapacity> {
    const [activeLeads, hotLeads] = await Promise.all([
      this.leadModel.countDocuments({
        assignedTo: managerId,
        isDeleted: false,
        status: { $nin: ['won', 'lost', 'converted'] },
      }),
      this.leadModel.countDocuments({
        assignedTo: managerId,
        isDeleted: false,
        intentLevel: 'hot',
        status: { $nin: ['won', 'lost', 'converted'] },
      }),
    ]);

    // Manager is available if under capacity
    const maxLeads = 8;
    const available = activeLeads < maxLeads;

    return {
      managerId,
      activeLeads,
      hotLeads,
      overdueTasks: 0, // TODO: integrate with tasks
      available,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN METHODS
  // ═══════════════════════════════════════════════════════════════════

  async createRule(data: Partial<LeadRoutingRule>): Promise<LeadRoutingRuleDocument> {
    return this.ruleModel.create(data);
  }

  async updateRule(ruleId: string, data: Partial<LeadRoutingRule>): Promise<LeadRoutingRuleDocument | null> {
    return this.ruleModel.findByIdAndUpdate(ruleId, { $set: data }, { new: true });
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    const result = await this.ruleModel.findByIdAndDelete(ruleId);
    return !!result;
  }

  async getRules(): Promise<any[]> {
    return this.ruleModel.find().sort({ priority: 1 }).lean();
  }

  async seedDefaultRules(): Promise<void> {
    const existing = await this.ruleModel.countDocuments();
    if (existing > 0) return;

    await this.ruleModel.insertMany([
      {
        name: 'Hot Leads Priority',
        isActive: true,
        priority: 1,
        conditions: { intentLevel: 'hot' },
        assignToType: 'team',
        assignToId: 'team_lead_id', // Replace with actual ID
        useCapacityCheck: true,
        staleAfterMinutes: 15,
      },
      {
        name: 'Website Leads',
        isActive: true,
        priority: 10,
        conditions: { source: 'website' },
        assignToType: 'team',
        assignToId: 'team_lead_id',
        useCapacityCheck: true,
        staleAfterMinutes: 30,
      },
      {
        name: 'Callback Requests',
        isActive: true,
        priority: 5,
        conditions: { source: 'callback' },
        assignToType: 'team',
        assignToId: 'team_lead_id',
        useCapacityCheck: true,
        staleAfterMinutes: 20,
      },
      {
        name: 'Default Queue',
        isActive: true,
        priority: 999,
        conditions: {},
        assignToType: 'queue',
        assignToId: 'default_queue',
        useCapacityCheck: false,
        staleAfterMinutes: 60,
      },
    ]);

    this.logger.log('Default routing rules seeded');
  }
}
