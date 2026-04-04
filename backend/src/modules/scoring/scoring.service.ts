/**
 * BIBI Cars - Scoring Service
 * Production-ready Score Engine with persistent storage
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ScoreSnapshot, ScoreSnapshotDocument, ScoreType, ScoreBand, ScoreFactor } from './schemas/score-snapshot.schema';
import { ScoreRule, ScoreRuleDocument } from './schemas/score-rule.schema';
import { EventBusService } from '../event-bus/event-bus.service';
import { EventTypes } from '../../common/events/system-event.interface';

// ═══════════════════════════════════════════════════════════
// DEFAULT SCORE RULES
// ═══════════════════════════════════════════════════════════

export const DEFAULT_LEAD_SCORE_RULES = [
  { code: 'source_referral', name: 'Referral Source', points: 20, condition: { field: 'source', operator: 'in', value: ['referral', 'partner'] } },
  { code: 'source_callback', name: 'Callback/Phone Source', points: 15, condition: { field: 'source', operator: 'in', value: ['callback', 'phone'] } },
  { code: 'source_website', name: 'Website Source', points: 10, condition: { field: 'source', operator: 'eq', value: 'website' } },
  { code: 'has_favorites', name: 'Has Favorites', points: 5, condition: { field: 'favoriteCount', operator: 'gt', value: 0 } },
  { code: 'has_compare', name: 'Used Compare', points: 8, condition: { field: 'compareCount', operator: 'gt', value: 0 } },
  { code: 'carfax_requested', name: 'Carfax Requested', points: 15, condition: { field: 'carfaxRequested', operator: 'eq', value: true } },
  { code: 'call_interested', name: 'Call Interested', points: 20, condition: { event: 'call.interested' } },
  { code: 'call_no_answer', name: 'No Answer (penalty)', points: -5, condition: { event: 'call.no_answer' } },
  { code: 'high_budget', name: 'High Budget', points: 10, condition: { field: 'budget', operator: 'gte', value: 30000 } },
];

export const DEFAULT_DEAL_HEALTH_RULES = [
  { code: 'stage_negotiation', name: 'Reached Negotiation', points: 15, condition: { field: 'stage', operator: 'eq', value: 'NEGOTIATION' } },
  { code: 'contract_signed', name: 'Contract Signed', points: 25, condition: { field: 'contractSigned', operator: 'eq', value: true } },
  { code: 'deposit_paid', name: 'Deposit Paid', points: 20, condition: { field: 'depositPaid', operator: 'eq', value: true } },
  { code: 'full_payment', name: 'Full Payment Done', points: 30, condition: { field: 'fullPaymentDone', operator: 'eq', value: true } },
  { code: 'invoice_overdue', name: 'Invoice Overdue (penalty)', points: -25, condition: { field: 'hasOverdueInvoice', operator: 'eq', value: true } },
  { code: 'stalled_deal', name: 'Deal Stalled >3 days (penalty)', points: -20, condition: { field: 'stalledDays', operator: 'gt', value: 3 } },
  { code: 'has_calls', name: 'Has Contact Calls', points: 10, condition: { field: 'hasCalls', operator: 'eq', value: true } },
];

export const DEFAULT_MANAGER_PERFORMANCE_RULES = [
  { code: 'calls_10', name: '10+ Calls Completed', points: 15, condition: { field: 'callsCompleted', operator: 'gte', value: 10 } },
  { code: 'hot_leads_touched', name: 'Hot Leads Touched', points: 20, condition: { field: 'hotLeadsTouched', operator: 'gte', value: 3 } },
  { code: 'deals_won', name: 'Deals Won', points: 30, condition: { field: 'dealsWon', operator: 'gte', value: 1 } },
  { code: 'overdue_tasks', name: 'Overdue Tasks (penalty)', points: -15, condition: { field: 'overdueTasks', operator: 'gt', value: 3 } },
  { code: 'stale_leads', name: 'Stale Leads (penalty)', points: -10, condition: { field: 'staleLeads', operator: 'gt', value: 2 } },
  { code: 'shipment_issues', name: 'Shipment Issues (penalty)', points: -10, condition: { field: 'shipmentIssues', operator: 'gt', value: 1 } },
];

export const DEFAULT_SHIPMENT_RISK_RULES = [
  { code: 'tracking_inactive', name: 'Tracking Inactive', points: 25, condition: { field: 'trackingActive', operator: 'eq', value: false } },
  { code: 'sync_stale_24h', name: 'No Sync >24h', points: 30, condition: { field: 'lastSyncHours', operator: 'gt', value: 24 } },
  { code: 'eta_delay', name: 'ETA Delayed', points: 25, condition: { field: 'etaDelayDays', operator: 'gt', value: 0 } },
  { code: 'customs_unpaid', name: 'Customs Unpaid', points: 25, condition: { field: 'customsUnpaid', operator: 'eq', value: true } },
  { code: 'stalled', name: 'Shipment Stalled', points: 35, condition: { field: 'currentStatus', operator: 'eq', value: 'stalled' } },
];

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    @InjectModel(ScoreSnapshot.name) private snapshotModel: Model<ScoreSnapshotDocument>,
    @InjectModel(ScoreRule.name) private ruleModel: Model<ScoreRuleDocument>,
    private readonly eventBus: EventBusService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // LEAD SCORE
  // ═══════════════════════════════════════════════════════════

  async recalculateLeadScore(lead: any): Promise<ScoreSnapshotDocument> {
    const factors: ScoreFactor[] = [];
    let value = 0;

    // Get active rules
    const rules = await this.getActiveRules('lead_score');

    for (const rule of rules) {
      if (this.evaluateCondition(lead, rule.condition)) {
        value += rule.points;
        factors.push({
          key: rule.code,
          points: rule.points,
          description: rule.name,
          timestamp: new Date(),
        });
        
        // Update hit count
        await this.ruleModel.updateOne(
          { _id: rule._id },
          { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }
        );
      }
    }

    // Ensure minimum 0
    value = Math.max(0, value);
    const band = this.resolveLeadBand(value);

    const snapshot = await this.saveSnapshot({
      entityType: 'lead',
      entityId: lead.id || lead._id?.toString(),
      scoreType: 'lead_score',
      value,
      band,
      factors,
      meta: { source: lead.source },
    });

    this.logger.log(`📊 Lead ${lead.id} score: ${value} (${band})`);

    // Emit HOT lead event
    if (band === 'hot') {
      await this.eventBus.emit({
        type: EventTypes.LEAD_HOT,
        aggregateType: 'lead',
        aggregateId: lead.id || lead._id?.toString(),
        payload: { leadId: lead.id, score: value, band },
        actorType: 'system',
        source: 'cron',
      });
    }

    return snapshot;
  }

  // ═══════════════════════════════════════════════════════════
  // DEAL HEALTH SCORE
  // ═══════════════════════════════════════════════════════════

  async recalculateDealHealth(deal: any): Promise<ScoreSnapshotDocument> {
    const factors: ScoreFactor[] = [];
    let value = 50; // Base health score

    const rules = await this.getActiveRules('deal_health');

    for (const rule of rules) {
      if (this.evaluateCondition(deal, rule.condition)) {
        value += rule.points;
        factors.push({
          key: rule.code,
          points: rule.points,
          description: rule.name,
          timestamp: new Date(),
        });

        await this.ruleModel.updateOne(
          { _id: rule._id },
          { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }
        );
      }
    }

    value = this.clamp(value, 0, 100);
    const band = this.resolveHealthBand(value);

    const snapshot = await this.saveSnapshot({
      entityType: 'deal',
      entityId: deal.id || deal._id?.toString(),
      scoreType: 'deal_health',
      value,
      band,
      factors,
      meta: { stage: deal.stage },
    });

    this.logger.log(`📊 Deal ${deal.id} health: ${value} (${band})`);

    // Emit low health event
    if (band === 'low') {
      await this.eventBus.emit({
        type: 'deal.health_low',
        aggregateType: 'deal',
        aggregateId: deal.id || deal._id?.toString(),
        payload: { dealId: deal.id, health: value, band },
        actorType: 'system',
        source: 'cron',
      });
    }

    return snapshot;
  }

  // ═══════════════════════════════════════════════════════════
  // MANAGER PERFORMANCE SCORE
  // ═══════════════════════════════════════════════════════════

  async recalculateManagerPerformance(manager: any): Promise<ScoreSnapshotDocument> {
    const factors: ScoreFactor[] = [];
    let value = 50; // Base performance

    const rules = await this.getActiveRules('manager_performance');

    for (const rule of rules) {
      if (this.evaluateCondition(manager, rule.condition)) {
        value += rule.points;
        factors.push({
          key: rule.code,
          points: rule.points,
          description: rule.name,
          timestamp: new Date(),
        });

        await this.ruleModel.updateOne(
          { _id: rule._id },
          { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }
        );
      }
    }

    value = this.clamp(value, 0, 100);
    const band = this.resolveHealthBand(value);

    const snapshot = await this.saveSnapshot({
      entityType: 'manager',
      entityId: manager.id || manager._id?.toString(),
      scoreType: 'manager_performance',
      value,
      band,
      factors,
      meta: { name: manager.name || manager.firstName },
    });

    this.logger.log(`📊 Manager ${manager.id} performance: ${value} (${band})`);

    return snapshot;
  }

  // ═══════════════════════════════════════════════════════════
  // SHIPMENT RISK SCORE
  // ═══════════════════════════════════════════════════════════

  async recalculateShipmentRisk(shipment: any): Promise<ScoreSnapshotDocument> {
    const factors: ScoreFactor[] = [];
    let value = 0; // Start at 0 risk

    const rules = await this.getActiveRules('shipment_risk');

    for (const rule of rules) {
      if (this.evaluateCondition(shipment, rule.condition)) {
        value += rule.points;
        factors.push({
          key: rule.code,
          points: rule.points,
          description: rule.name,
          timestamp: new Date(),
        });

        await this.ruleModel.updateOne(
          { _id: rule._id },
          { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }
        );
      }
    }

    value = this.clamp(value, 0, 100);
    const band = this.resolveRiskBand(value);

    const snapshot = await this.saveSnapshot({
      entityType: 'shipment',
      entityId: shipment.id || shipment._id?.toString(),
      scoreType: 'shipment_risk',
      value,
      band,
      factors,
      meta: { status: shipment.currentStatus },
    });

    this.logger.log(`📊 Shipment ${shipment.id} risk: ${value} (${band})`);

    // Emit critical risk event
    if (band === 'critical') {
      await this.eventBus.emit({
        type: 'shipment.risk_critical',
        aggregateType: 'shipment',
        aggregateId: shipment.id || shipment._id?.toString(),
        payload: { shipmentId: shipment.id, risk: value, factors },
        actorType: 'system',
        source: 'cron',
      });
    }

    return snapshot;
  }

  // ═══════════════════════════════════════════════════════════
  // QUERY METHODS
  // ═══════════════════════════════════════════════════════════

  async getScore(entityType: string, entityId: string, scoreType?: ScoreType): Promise<any[]> {
    const filter: any = { entityType, entityId };
    if (scoreType) filter.scoreType = scoreType;
    
    return this.snapshotModel.find(filter).sort({ lastCalculatedAt: -1 }).lean();
  }

  async getScoresByType(scoreType: ScoreType, band?: ScoreBand, limit = 50): Promise<any[]> {
    const filter: any = { scoreType };
    if (band) filter.band = band;

    return this.snapshotModel.find(filter).sort({ value: -1 }).limit(limit).lean();
  }

  async getHotLeads(limit = 20): Promise<any[]> {
    return this.snapshotModel
      .find({ scoreType: 'lead_score', band: 'hot' })
      .sort({ value: -1 })
      .limit(limit)
      .lean();
  }

  async getLowHealthDeals(limit = 20): Promise<any[]> {
    return this.snapshotModel
      .find({ scoreType: 'deal_health', band: 'low' })
      .sort({ value: 1 })
      .limit(limit)
      .lean();
  }

  async getCriticalShipments(limit = 20): Promise<any[]> {
    return this.snapshotModel
      .find({ scoreType: 'shipment_risk', band: { $in: ['high', 'critical'] } })
      .sort({ value: -1 })
      .limit(limit)
      .lean();
  }

  async getTopManagers(limit = 10): Promise<any[]> {
    return this.snapshotModel
      .find({ scoreType: 'manager_performance' })
      .sort({ value: -1 })
      .limit(limit)
      .lean();
  }

  async getWeakManagers(limit = 10): Promise<any[]> {
    return this.snapshotModel
      .find({ scoreType: 'manager_performance', band: 'low' })
      .sort({ value: 1 })
      .limit(limit)
      .lean();
  }

  // ═══════════════════════════════════════════════════════════
  // RULE MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async getActiveRules(scoreType: ScoreType): Promise<any[]> {
    return this.ruleModel.find({ scoreType, isActive: true }).lean();
  }

  async getAllRules(scoreType?: ScoreType): Promise<any[]> {
    const filter: any = {};
    if (scoreType) filter.scoreType = scoreType;
    return this.ruleModel.find(filter).sort({ scoreType: 1, code: 1 }).lean();
  }

  async createRule(data: Partial<ScoreRule>): Promise<any> {
    return this.ruleModel.create(data);
  }

  async updateRule(code: string, data: Partial<ScoreRule>): Promise<any> {
    return this.ruleModel.findOneAndUpdate({ code }, { $set: data }, { new: true });
  }

  async toggleRule(code: string, isActive: boolean): Promise<any> {
    return this.ruleModel.findOneAndUpdate({ code }, { $set: { isActive } }, { new: true });
  }

  async deleteRule(code: string): Promise<boolean> {
    const result = await this.ruleModel.deleteOne({ code });
    return result.deletedCount > 0;
  }

  // ═══════════════════════════════════════════════════════════
  // SEED DEFAULT RULES
  // ═══════════════════════════════════════════════════════════

  async seedDefaultRules(): Promise<void> {
    const allDefaults = [
      ...DEFAULT_LEAD_SCORE_RULES.map(r => ({ ...r, scoreType: 'lead_score' as const })),
      ...DEFAULT_DEAL_HEALTH_RULES.map(r => ({ ...r, scoreType: 'deal_health' as const })),
      ...DEFAULT_MANAGER_PERFORMANCE_RULES.map(r => ({ ...r, scoreType: 'manager_performance' as const })),
      ...DEFAULT_SHIPMENT_RISK_RULES.map(r => ({ ...r, scoreType: 'shipment_risk' as const })),
    ];

    for (const rule of allDefaults) {
      await this.ruleModel.updateOne(
        { code: rule.code },
        { $setOnInsert: rule },
        { upsert: true }
      );
    }

    this.logger.log(`✅ Seeded ${allDefaults.length} default score rules`);
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private async saveSnapshot(data: Partial<ScoreSnapshot>): Promise<ScoreSnapshotDocument> {
    return this.snapshotModel.findOneAndUpdate(
      { entityType: data.entityType, entityId: data.entityId, scoreType: data.scoreType },
      { $set: { ...data, lastCalculatedAt: new Date() } },
      { upsert: true, new: true }
    );
  }

  private evaluateCondition(entity: any, condition: any): boolean {
    if (!condition || !condition.field) return false;

    const value = entity[condition.field];
    const target = condition.value;

    switch (condition.operator) {
      case 'eq': return value === target;
      case 'ne': return value !== target;
      case 'gt': return value > target;
      case 'gte': return value >= target;
      case 'lt': return value < target;
      case 'lte': return value <= target;
      case 'in': return Array.isArray(target) && target.includes(value);
      case 'nin': return Array.isArray(target) && !target.includes(value);
      case 'exists': return value !== undefined && value !== null;
      default: return false;
    }
  }

  private resolveLeadBand(value: number): ScoreBand {
    if (value <= 10) return 'cold';
    if (value <= 25) return 'warm';
    return 'hot';
  }

  private resolveHealthBand(value: number): ScoreBand {
    if (value < 40) return 'low';
    if (value < 70) return 'medium';
    return 'high';
  }

  private resolveRiskBand(value: number): ScoreBand {
    if (value < 30) return 'low';
    if (value < 60) return 'medium';
    if (value < 80) return 'high';
    return 'critical';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
