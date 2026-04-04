/**
 * BIBI Cars - Score Handler (Updated)
 * Updates scores on relevant events with persistent storage
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnSystemEvent } from '../../common/events/on-event.decorator';
import { SystemEvent, EventTypes } from '../../common/events/system-event.interface';
import { ScoringService } from './scoring.service';

@Injectable()
export class ScoreHandler implements OnModuleInit {
  private readonly logger = new Logger(ScoreHandler.name);

  constructor(private readonly scoringService: ScoringService) {}

  async onModuleInit() {
    // Seed default rules on startup
    await this.scoringService.seedDefaultRules();
  }

  // ═══════════════════════════════════════════════════════════
  // LEAD SCORE EVENTS
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.LEAD_CREATED)
  async onLeadCreated(event: SystemEvent) {
    const lead = event.payload;
    if (lead.id || lead.leadId) {
      await this.scoringService.recalculateLeadScore({
        id: lead.id || lead.leadId,
        ...lead,
      });
    }
  }

  @OnSystemEvent('lead.updated')
  async onLeadUpdated(event: SystemEvent) {
    const lead = event.payload;
    if (lead.id || lead.leadId || event.aggregateId) {
      await this.scoringService.recalculateLeadScore({
        id: lead.id || lead.leadId || event.aggregateId,
        ...lead,
      });
    }
  }

  @OnSystemEvent(EventTypes.CALL_INTERESTED)
  async onCallInterested(event: SystemEvent) {
    const lead = event.payload;
    if (lead.leadId || event.aggregateId) {
      await this.scoringService.recalculateLeadScore({
        id: lead.leadId || event.aggregateId,
        ...lead,
        callInterested: true,
      });
    }
  }

  @OnSystemEvent(EventTypes.CALL_NO_ANSWER)
  async onCallNoAnswer(event: SystemEvent) {
    // Note: This decreases score, handled by rules
    this.logger.log(`📊 Call no answer for lead ${event.aggregateId}`);
  }

  // ═══════════════════════════════════════════════════════════
  // DEAL HEALTH EVENTS
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.DEAL_CREATED)
  async onDealCreated(event: SystemEvent) {
    const deal = event.payload.deal || event.payload;
    if (deal.id || event.aggregateId) {
      await this.scoringService.recalculateDealHealth({
        id: deal.id || event.aggregateId,
        ...deal,
      });
    }
  }

  @OnSystemEvent(EventTypes.DEAL_STAGE_CHANGED)
  async onDealStageChanged(event: SystemEvent) {
    const deal = event.payload.deal || event.payload;
    if (deal.id || event.aggregateId) {
      await this.scoringService.recalculateDealHealth({
        id: deal.id || event.aggregateId,
        stage: event.payload.to || deal.stage,
        ...deal,
      });
    }
  }

  @OnSystemEvent(EventTypes.CONTRACT_SIGNED)
  async onContractSigned(event: SystemEvent) {
    const deal = event.payload.deal || event.payload;
    if (deal.id || deal.dealId || event.aggregateId) {
      await this.scoringService.recalculateDealHealth({
        id: deal.id || deal.dealId || event.aggregateId,
        contractSigned: true,
        ...deal,
      });
    }
  }

  @OnSystemEvent(EventTypes.INVOICE_PAID)
  async onInvoicePaid(event: SystemEvent) {
    const deal = event.payload.deal || event.payload;
    if (deal.id || deal.dealId || event.aggregateId) {
      await this.scoringService.recalculateDealHealth({
        id: deal.id || deal.dealId || event.aggregateId,
        depositPaid: true,
        ...deal,
      });
    }
  }

  @OnSystemEvent(EventTypes.INVOICE_OVERDUE)
  async onInvoiceOverdue(event: SystemEvent) {
    const deal = event.payload.deal || event.payload;
    if (deal.id || deal.dealId || event.aggregateId) {
      await this.scoringService.recalculateDealHealth({
        id: deal.id || deal.dealId || event.aggregateId,
        hasOverdueInvoice: true,
        ...deal,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MANAGER PERFORMANCE EVENTS
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.DEAL_CLOSED_WON)
  async onDealWon(event: SystemEvent) {
    const managerId = event.payload.managerId;
    if (managerId) {
      // Note: In production, fetch manager stats from DB
      await this.scoringService.recalculateManagerPerformance({
        id: managerId,
        dealsWon: 1,
      });
    }
  }

  @OnSystemEvent(EventTypes.TASK_OVERDUE)
  async onTaskOverdue(event: SystemEvent) {
    const managerId = event.payload.managerId || event.payload.assignedTo;
    if (managerId) {
      await this.scoringService.recalculateManagerPerformance({
        id: managerId,
        overdueTasks: (event.payload.overdueCount || 1),
      });
    }
  }

  @OnSystemEvent(EventTypes.TASK_COMPLETED)
  async onTaskCompleted(event: SystemEvent) {
    const managerId = event.payload.managerId || event.payload.completedBy;
    if (managerId) {
      this.logger.log(`📊 Task completed by manager ${managerId}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SHIPMENT RISK EVENTS
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.SHIPMENT_STATUS_CHANGED)
  async onShipmentStatusChanged(event: SystemEvent) {
    const shipment = event.payload.shipment || event.payload;
    if (shipment.id || event.aggregateId) {
      await this.scoringService.recalculateShipmentRisk({
        id: shipment.id || event.aggregateId,
        currentStatus: event.payload.newStatus || shipment.currentStatus,
        ...shipment,
      });
    }
  }

  @OnSystemEvent(EventTypes.SHIPMENT_STALLED)
  async onShipmentStalled(event: SystemEvent) {
    const shipment = event.payload.shipment || event.payload;
    if (shipment.id || event.aggregateId) {
      await this.scoringService.recalculateShipmentRisk({
        id: shipment.id || event.aggregateId,
        currentStatus: 'stalled',
        ...shipment,
      });
    }
  }

  @OnSystemEvent(EventTypes.SHIPMENT_DELAYED)
  async onShipmentDelayed(event: SystemEvent) {
    const shipment = event.payload.shipment || event.payload;
    if (shipment.id || event.aggregateId) {
      await this.scoringService.recalculateShipmentRisk({
        id: shipment.id || event.aggregateId,
        etaDelayDays: event.payload.delayDays || 1,
        ...shipment,
      });
    }
  }

  @OnSystemEvent(EventTypes.SHIPMENT_SYNC_FAILED)
  async onShipmentSyncFailed(event: SystemEvent) {
    const shipment = event.payload.shipment || event.payload;
    if (shipment.id || event.aggregateId) {
      await this.scoringService.recalculateShipmentRisk({
        id: shipment.id || event.aggregateId,
        lastSyncHours: 48, // Mark as stale
        ...shipment,
      });
    }
  }
}
