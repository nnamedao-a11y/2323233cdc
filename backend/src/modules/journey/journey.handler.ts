/**
 * BIBI Cars - Journey Handler (Updated)
 * Logs all important events to Journey Engine
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnSystemEvent } from '../../common/events/on-event.decorator';
import { SystemEvent, EventTypes } from '../../common/events/system-event.interface';
import { JourneyService } from './journey.service';

@Injectable()
export class JourneyHandler {
  private readonly logger = new Logger(JourneyHandler.name);

  constructor(private readonly journeyService: JourneyService) {}

  // ═══════════════════════════════════════════════════════════
  // LEAD JOURNEY
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.LEAD_CREATED)
  async onLeadCreated(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'lead',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'NEW_LEAD',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Лід створено',
    });
  }

  @OnSystemEvent(EventTypes.LEAD_ASSIGNED)
  async onLeadAssigned(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'lead',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'ASSIGNED',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: `Призначено менеджеру: ${event.payload.managerId}`,
    });
  }

  @OnSystemEvent(EventTypes.CALL_COMPLETED)
  async onCallCompleted(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'lead',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'CONTACT_ATTEMPT',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Дзвінок завершено',
    });
  }

  @OnSystemEvent(EventTypes.CALL_INTERESTED)
  async onCallInterested(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'lead',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'QUALIFIED',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Клієнт зацікавлений',
    });
  }

  @OnSystemEvent(EventTypes.LEAD_HOT)
  async onLeadHot(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'lead',
      entityId: event.aggregateId,
      eventType: event.type,
      payload: event.payload,
      actorType: 'system',
      source: 'event_bus',
      description: 'Лід позначено як HOT',
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DEAL JOURNEY
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.DEAL_CREATED)
  async onDealCreated(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'deal',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'NEW_LEAD',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Угоду створено',
    });
  }

  @OnSystemEvent(EventTypes.DEAL_STAGE_CHANGED)
  async onDealStageChanged(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'deal',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: event.payload?.to,
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: `Стадія: ${event.payload?.from} → ${event.payload?.to}`,
    });
  }

  @OnSystemEvent(EventTypes.CONTRACT_CREATED)
  async onContractCreated(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'deal',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'CONTRACT_SENT',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Контракт створено',
    });
  }

  @OnSystemEvent(EventTypes.CONTRACT_SIGNED)
  async onContractSigned(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'deal',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'CONTRACT_SIGNED',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Контракт підписано',
    });
  }

  @OnSystemEvent(EventTypes.INVOICE_CREATED)
  async onInvoiceCreated(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'deal',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'PAYMENT_PENDING',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Інвойс створено',
    });
  }

  @OnSystemEvent(EventTypes.INVOICE_PAID)
  async onInvoicePaid(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'deal',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'PAYMENT_DONE',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: `Оплата отримана: $${event.payload?.amount || 0}`,
    });
  }

  @OnSystemEvent(EventTypes.DEAL_CLOSED_WON)
  async onDealWon(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'deal',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'DELIVERED',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Угоду закрито (виграно)',
    });
  }

  @OnSystemEvent(EventTypes.DEAL_CLOSED_LOST)
  async onDealLost(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'deal',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'CLOSED_LOST',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: `Угоду закрито (втрачено): ${event.payload?.lostReason || 'невідомо'}`,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SHIPMENT JOURNEY
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.SHIPMENT_CREATED)
  async onShipmentCreated(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'shipment',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'SHIPPING',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Відправлення створено',
    });
  }

  @OnSystemEvent(EventTypes.SHIPMENT_STATUS_CHANGED)
  async onShipmentStatusChanged(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'shipment',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: event.payload?.newStatus || 'SHIPPING',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: `Статус: ${event.payload?.oldStatus} → ${event.payload?.newStatus}`,
    });
  }

  @OnSystemEvent(EventTypes.SHIPMENT_DELIVERED)
  async onShipmentDelivered(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'shipment',
      entityId: event.aggregateId,
      eventType: event.type,
      stage: 'DELIVERED',
      payload: event.payload,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      description: 'Відправлення доставлено',
    });

    // Also update deal journey if dealId is present
    if (event.payload?.dealId) {
      await this.journeyService.appendEvent({
        entityType: 'deal',
        entityId: event.payload.dealId,
        eventType: 'shipment.delivered',
        stage: 'DELIVERED',
        payload: event.payload,
        actorType: 'system',
        source: 'event_bus',
        description: 'Авто доставлено клієнту',
      });
    }
  }

  @OnSystemEvent(EventTypes.SHIPMENT_STALLED)
  async onShipmentStalled(event: SystemEvent) {
    await this.journeyService.appendEvent({
      entityType: 'shipment',
      entityId: event.aggregateId,
      eventType: event.type,
      payload: event.payload,
      actorType: 'system',
      source: 'cron',
      description: 'Відправлення застрягло',
    });
  }
}
