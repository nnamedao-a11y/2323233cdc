/**
 * BIBI Cars - Notification Event Handler
 * 
 * Listens to system events via Event Bus and creates notifications
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnSystemEvent } from '../../common/events/on-event.decorator';
import { NotificationService, SystemEvent } from './notification.service';

@Injectable()
export class NotificationEventHandler {
  private readonly logger = new Logger(NotificationEventHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Handle new lead creation
   */
  @OnSystemEvent('lead.created')
  async onLeadCreated(event: SystemEvent) {
    this.logger.log(`[Event] lead.created - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle invoice overdue
   */
  @OnSystemEvent('invoice.overdue')
  async onInvoiceOverdue(event: SystemEvent) {
    this.logger.log(`[Event] invoice.overdue - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle shipment stalled (no updates)
   */
  @OnSystemEvent('shipment.stalled')
  async onShipmentStalled(event: SystemEvent) {
    this.logger.log(`[Event] shipment.stalled - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle shipment no tracking
   */
  @OnSystemEvent('shipment.no_tracking')
  async onShipmentNoTracking(event: SystemEvent) {
    this.logger.log(`[Event] shipment.no_tracking - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle contract signed
   */
  @OnSystemEvent('contract.signed')
  async onContractSigned(event: SystemEvent) {
    this.logger.log(`[Event] contract.signed - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle payment failed
   */
  @OnSystemEvent('payment.failed')
  async onPaymentFailed(event: SystemEvent) {
    this.logger.log(`[Event] payment.failed - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle manager inactive
   */
  @OnSystemEvent('manager.inactive')
  async onManagerInactive(event: SystemEvent) {
    this.logger.log(`[Event] manager.inactive - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle suspicious session
   */
  @OnSystemEvent('staff.session_suspicious')
  async onSuspiciousSession(event: SystemEvent) {
    this.logger.log(`[Event] staff.session_suspicious - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle deal status change
   */
  @OnSystemEvent('deal.status_changed')
  async onDealStatusChanged(event: SystemEvent) {
    this.logger.log(`[Event] deal.status_changed - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle invoice created
   */
  @OnSystemEvent('invoice.created')
  async onInvoiceCreated(event: SystemEvent) {
    this.logger.log(`[Event] invoice.created - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }

  /**
   * Handle payment received
   */
  @OnSystemEvent('payment.received')
  async onPaymentReceived(event: SystemEvent) {
    this.logger.log(`[Event] payment.received - ${event.aggregateId}`);
    await this.notificationService.createFromEvent(event);
  }
}
