/**
 * BIBI Cars - Cadence Event Handler
 * Listens to events and starts appropriate cadences
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnSystemEvent } from '../../common/events/on-event.decorator';
import { SystemEvent, EventTypes } from '../../common/events/system-event.interface';
import { CadenceService } from './cadence.service';
import { EVENT_TO_CADENCE } from './cadence.definitions';

@Injectable()
export class CadenceHandler {
  private readonly logger = new Logger(CadenceHandler.name);

  constructor(private readonly cadenceService: CadenceService) {}

  // ═══════════════════════════════════════════════════════════
  // LEAD CADENCES
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.LEAD_CREATED)
  async onLeadCreated(event: SystemEvent) {
    // Skip if already assigned (routing will handle)
    if (event.payload.assignedTo) {
      this.logger.log(`Skipping NEW_LEAD cadence - already assigned`);
      return;
    }

    await this.cadenceService.startCadence({
      cadenceCode: 'NEW_LEAD_V1',
      entityType: 'lead',
      entityId: event.aggregateId,
      triggerEvent: event.type,
    });
  }

  @OnSystemEvent(EventTypes.CALL_NO_ANSWER)
  async onCallNoAnswer(event: SystemEvent) {
    // Start no-answer cadence for the lead
    const leadId = event.payload.leadId || event.aggregateId;

    await this.cadenceService.startCadence({
      cadenceCode: 'NO_ANSWER_V1',
      entityType: 'lead',
      entityId: leadId,
      triggerEvent: event.type,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DEAL CADENCES
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.CONTRACT_SENT)
  async onContractSent(event: SystemEvent) {
    await this.cadenceService.startCadence({
      cadenceCode: 'CONTRACT_PENDING_V1',
      entityType: 'deal',
      entityId: event.aggregateId,
      triggerEvent: event.type,
    });
  }

  @OnSystemEvent(EventTypes.CONTRACT_SIGNED)
  async onContractSigned(event: SystemEvent) {
    // Stop contract pending cadence
    await this.cadenceService.stopCadence(
      'CONTRACT_PENDING_V1',
      event.aggregateId,
      'contract_signed'
    );
  }

  // ═══════════════════════════════════════════════════════════
  // INVOICE CADENCES
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.INVOICE_OVERDUE)
  async onInvoiceOverdue(event: SystemEvent) {
    await this.cadenceService.startCadence({
      cadenceCode: 'PAYMENT_OVERDUE_V1',
      entityType: 'invoice',
      entityId: event.aggregateId,
      triggerEvent: event.type,
    });
  }

  @OnSystemEvent(EventTypes.INVOICE_PAID)
  async onInvoicePaid(event: SystemEvent) {
    // Stop overdue cadence
    await this.cadenceService.stopCadence(
      'PAYMENT_OVERDUE_V1',
      event.aggregateId,
      'invoice_paid'
    );
  }

  // ═══════════════════════════════════════════════════════════
  // SHIPMENT CADENCES
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.SHIPMENT_STALLED)
  async onShipmentStalled(event: SystemEvent) {
    await this.cadenceService.startCadence({
      cadenceCode: 'SHIPMENT_STALLED_V1',
      entityType: 'shipment',
      entityId: event.aggregateId,
      triggerEvent: event.type,
    });
  }

  @OnSystemEvent(EventTypes.SHIPMENT_STATUS_CHANGED)
  async onShipmentStatusChanged(event: SystemEvent) {
    // Stop stalled cadence if shipment is now moving
    await this.cadenceService.stopCadence(
      'SHIPMENT_STALLED_V1',
      event.aggregateId,
      'shipment_status_changed'
    );
  }

  @OnSystemEvent(EventTypes.SHIPMENT_DELIVERED)
  async onShipmentDelivered(event: SystemEvent) {
    await this.cadenceService.stopCadence(
      'SHIPMENT_STALLED_V1',
      event.aggregateId,
      'shipment_delivered'
    );
  }
}
