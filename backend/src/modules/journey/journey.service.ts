/**
 * BIBI Cars - Journey Service
 * Production-ready Journey Engine with persistent storage
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JourneyEvent, JourneyEventDocument } from './schemas/journey-event.schema';
import { JourneySnapshot, JourneySnapshotDocument } from './schemas/journey-snapshot.schema';

// Stage order for funnel analysis
const STAGE_ORDER = [
  'NEW_LEAD',
  'CONTACT_ATTEMPT',
  'QUALIFIED',
  'CAR_SELECTED',
  'NEGOTIATION',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'PAYMENT_PENDING',
  'PAYMENT_DONE',
  'SHIPPING',
  'DELIVERED',
];

@Injectable()
export class JourneyService {
  private readonly logger = new Logger(JourneyService.name);

  constructor(
    @InjectModel(JourneyEvent.name) private eventModel: Model<JourneyEventDocument>,
    @InjectModel(JourneySnapshot.name) private snapshotModel: Model<JourneySnapshotDocument>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // APPEND EVENT
  // ═══════════════════════════════════════════════════════════

  async appendEvent(input: {
    entityType: 'lead' | 'deal' | 'shipment' | 'customer';
    entityId: string;
    eventType: string;
    stage?: string;
    payload?: Record<string, any>;
    actorType?: string;
    actorId?: string;
    source?: string;
    description?: string;
  }): Promise<JourneyEventDocument> {
    const event = await this.eventModel.create({
      ...input,
      payload: input.payload || {},
    });

    // Update snapshot
    await this.updateSnapshot(input);

    this.logger.debug(`Journey: ${input.entityType}:${input.entityId} -> ${input.eventType}`);

    return event;
  }

  // ═══════════════════════════════════════════════════════════
  // TIMELINE QUERIES
  // ═══════════════════════════════════════════════════════════

  async getTimeline(entityType: string, entityId: string, limit = 100): Promise<any[]> {
    return this.eventModel
      .find({ entityType, entityId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
  }

  async getSnapshot(entityType: string, entityId: string): Promise<any> {
    return this.snapshotModel.findOne({ entityType, entityId }).lean();
  }

  async getRecentEvents(entityType?: string, limit = 50): Promise<any[]> {
    const filter: any = {};
    if (entityType) filter.entityType = entityType;

    return this.eventModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  // ═══════════════════════════════════════════════════════════
  // FUNNEL ANALYTICS
  // ═══════════════════════════════════════════════════════════

  async getFunnelStats(days = 30): Promise<any> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshots = await this.snapshotModel.find({
      entityType: 'deal',
      startedAt: { $gte: since },
    }).lean();

    const funnel: Record<string, number> = {};
    STAGE_ORDER.forEach(stage => { funnel[stage] = 0; });

    for (const snap of snapshots) {
      for (const stage of snap.completedStages || []) {
        if (funnel[stage] !== undefined) {
          funnel[stage]++;
        }
      }
    }

    // Calculate drop-off rates
    const dropOff: Array<{ from: string; to: string; count: number; rate: number }> = [];
    for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
      const from = STAGE_ORDER[i];
      const to = STAGE_ORDER[i + 1];
      const fromCount = funnel[from] || 0;
      const toCount = funnel[to] || 0;
      const dropped = fromCount - toCount;
      const rate = fromCount > 0 ? (dropped / fromCount) * 100 : 0;

      dropOff.push({ from, to, count: dropped, rate: Math.round(rate * 10) / 10 });
    }

    return {
      period: `${days} days`,
      funnel,
      dropOff,
      totalDeals: snapshots.length,
      delivered: funnel['DELIVERED'] || 0,
      conversionRate: snapshots.length > 0 
        ? Math.round(((funnel['DELIVERED'] || 0) / snapshots.length) * 1000) / 10 
        : 0,
    };
  }

  async getBottlenecks(days = 30): Promise<any[]> {
    const funnelStats = await this.getFunnelStats(days);
    
    // Sort by drop-off rate to find biggest bottlenecks
    return funnelStats.dropOff
      .filter((d: any) => d.rate > 0)
      .sort((a: any, b: any) => b.rate - a.rate)
      .slice(0, 5);
  }

  async getAverageJourneyDurations(days = 30): Promise<any> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const completedJourneys = await this.snapshotModel.find({
      entityType: 'deal',
      'metrics.delivered': true,
      startedAt: { $gte: since },
    }).lean();

    if (completedJourneys.length === 0) {
      return { count: 0, averages: {} };
    }

    const totals = {
      daysToContact: 0,
      daysToDeal: 0,
      daysToContract: 0,
      daysToPayment: 0,
      daysToDelivery: 0,
      totalJourneyDays: 0,
    };

    let count = 0;
    for (const journey of completedJourneys) {
      const m = journey.metrics || {};
      if (m.totalJourneyDays) {
        totals.daysToContact += m.daysToContact || 0;
        totals.daysToDeal += m.daysToDeal || 0;
        totals.daysToContract += m.daysToContract || 0;
        totals.daysToPayment += m.daysToPayment || 0;
        totals.daysToDelivery += m.daysToDelivery || 0;
        totals.totalJourneyDays += m.totalJourneyDays || 0;
        count++;
      }
    }

    return {
      count,
      averages: {
        daysToContact: count > 0 ? Math.round(totals.daysToContact / count * 10) / 10 : 0,
        daysToDeal: count > 0 ? Math.round(totals.daysToDeal / count * 10) / 10 : 0,
        daysToContract: count > 0 ? Math.round(totals.daysToContract / count * 10) / 10 : 0,
        daysToPayment: count > 0 ? Math.round(totals.daysToPayment / count * 10) / 10 : 0,
        daysToDelivery: count > 0 ? Math.round(totals.daysToDelivery / count * 10) / 10 : 0,
        totalJourneyDays: count > 0 ? Math.round(totals.totalJourneyDays / count * 10) / 10 : 0,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SNAPSHOT UPDATE
  // ═══════════════════════════════════════════════════════════

  private async updateSnapshot(event: any): Promise<JourneySnapshotDocument> {
    let snapshot = await this.snapshotModel.findOne({
      entityType: event.entityType,
      entityId: event.entityId,
    });

    if (!snapshot) {
      snapshot = new this.snapshotModel({
        entityType: event.entityType,
        entityId: event.entityId,
        completedStages: [],
        eventCount: 0,
        metrics: {},
        touchpoints: [],
      });
    }

    // Update basic fields
    snapshot.lastEventAt = new Date();
    snapshot.eventCount = (snapshot.eventCount || 0) + 1;

    // Track stage
    if (event.stage && !snapshot.completedStages.includes(event.stage)) {
      snapshot.completedStages.push(event.stage);
      snapshot.currentStage = event.stage;
    }

    // Track touchpoints
    if (!snapshot.touchpoints.includes(event.eventType)) {
      snapshot.touchpoints.push(event.eventType);
    }

    // Update metrics based on event type
    const metrics = snapshot.metrics || {};

    switch (event.eventType) {
      case 'lead.created':
        metrics.leadCreated = true;
        snapshot.startedAt = snapshot.startedAt || new Date();
        break;

      case 'call.completed':
      case 'call.interested':
        if (!metrics.firstContactAt) {
          metrics.firstContactAt = new Date();
          if (snapshot.startedAt) {
            metrics.daysToContact = this.daysBetween(snapshot.startedAt, new Date());
          }
        }
        metrics.contactCount = (metrics.contactCount || 0) + 1;
        break;

      case 'deal.created':
        metrics.dealCreated = true;
        if (snapshot.startedAt) {
          metrics.daysToDeal = this.daysBetween(snapshot.startedAt, new Date());
        }
        break;

      case 'contract.signed':
        metrics.contractSigned = true;
        if (snapshot.startedAt) {
          metrics.daysToContract = this.daysBetween(snapshot.startedAt, new Date());
        }
        break;

      case 'invoice.paid':
      case 'payment.received':
        metrics.paymentCount = (metrics.paymentCount || 0) + 1;
        metrics.totalPaid = (metrics.totalPaid || 0) + (event.payload?.amount || 0);
        if (!metrics.daysToPayment && snapshot.startedAt) {
          metrics.daysToPayment = this.daysBetween(snapshot.startedAt, new Date());
        }
        break;

      case 'shipment.created':
        metrics.shipmentCreated = true;
        break;

      case 'shipment.delivered':
        metrics.delivered = true;
        metrics.deliveredAt = new Date();
        if (snapshot.startedAt) {
          metrics.daysToDelivery = this.daysBetween(snapshot.startedAt, new Date());
          metrics.totalJourneyDays = this.daysBetween(snapshot.startedAt, new Date());
        }
        break;
    }

    snapshot.metrics = metrics;
    await snapshot.save();

    return snapshot;
  }

  private daysBetween(start: Date, end: Date): number {
    const diff = end.getTime() - start.getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24) * 10) / 10;
  }
}
