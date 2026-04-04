import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EscalationService } from './escalation.service';

@Injectable()
export class EscalationHandler {
  private readonly logger = new Logger(EscalationHandler.name);

  constructor(
    private readonly escalationService: EscalationService,
  ) {}

  @OnEvent('lead.hot_not_contacted')
  async onHotLead(event: any) {
    this.logger.log(`Handling lead.hot_not_contacted for ${event.aggregateId}`);
    await this.escalationService.startEscalation({
      eventType: event.type,
      entityType: 'lead',
      entityId: event.aggregateId,
      managerId: event.payload?.managerId,
      teamLeadId: event.payload?.teamLeadId,
      meta: event.payload,
    });
  }

  @OnEvent('invoice.overdue')
  async onInvoiceOverdue(event: any) {
    this.logger.log(`Handling invoice.overdue for ${event.aggregateId}`);
    await this.escalationService.startEscalation({
      eventType: event.type,
      entityType: 'invoice',
      entityId: event.aggregateId,
      managerId: event.payload?.managerId,
      teamLeadId: event.payload?.teamLeadId,
      meta: event.payload,
    });
  }

  @OnEvent('shipment.stalled')
  async onShipmentStalled(event: any) {
    this.logger.log(`Handling shipment.stalled for ${event.aggregateId}`);
    await this.escalationService.startEscalation({
      eventType: event.type,
      entityType: 'shipment',
      entityId: event.aggregateId,
      managerId: event.payload?.managerId,
      teamLeadId: event.payload?.teamLeadId,
      meta: event.payload,
    });
  }

  @OnEvent('shipment.tracking_missing')
  async onTrackingMissing(event: any) {
    this.logger.log(`Handling shipment.tracking_missing for ${event.aggregateId}`);
    await this.escalationService.startEscalation({
      eventType: event.type,
      entityType: 'shipment',
      entityId: event.aggregateId,
      managerId: event.payload?.managerId,
      teamLeadId: event.payload?.teamLeadId,
      meta: event.payload,
    });
  }

  @OnEvent('payment.failed')
  async onPaymentFailed(event: any) {
    this.logger.log(`Handling payment.failed for ${event.aggregateId}`);
    await this.escalationService.startEscalation({
      eventType: event.type,
      entityType: 'payment',
      entityId: event.aggregateId,
      managerId: event.payload?.managerId,
      teamLeadId: event.payload?.teamLeadId,
      meta: event.payload,
    });
  }

  @OnEvent('staff.session_suspicious')
  async onSuspiciousSession(event: any) {
    this.logger.log(`Handling staff.session_suspicious for ${event.aggregateId}`);
    await this.escalationService.startEscalation({
      eventType: event.type,
      entityType: 'session',
      entityId: event.aggregateId,
      meta: event.payload,
    });
  }

  // Auto-resolve handlers
  @OnEvent('lead.contacted')
  async onLeadContacted(event: any) {
    await this.escalationService.resolveEscalation({
      eventType: 'lead.hot_not_contacted',
      entityId: event.aggregateId,
      userId: event.payload?.userId || 'system',
      reason: 'lead_contacted',
    });
  }

  @OnEvent('invoice.paid')
  async onInvoicePaid(event: any) {
    await this.escalationService.resolveEscalation({
      eventType: 'invoice.overdue',
      entityId: event.aggregateId,
      userId: event.payload?.userId || 'system',
      reason: 'invoice_paid',
    });
  }

  @OnEvent('shipment.tracking_added')
  async onTrackingAdded(event: any) {
    await this.escalationService.resolveEscalation({
      eventType: 'shipment.tracking_missing',
      entityId: event.aggregateId,
      userId: event.payload?.userId || 'system',
      reason: 'tracking_added',
    });
  }

  @OnEvent('shipment.synced')
  async onShipmentSynced(event: any) {
    await this.escalationService.resolveEscalation({
      eventType: 'shipment.stalled',
      entityId: event.aggregateId,
      userId: 'system',
      reason: 'shipment_synced',
    });
  }
}
