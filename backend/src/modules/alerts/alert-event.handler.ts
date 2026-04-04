/**
 * BIBI Cars - Alert Event Handler
 * Listens to system events and sends alerts
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnSystemEvent } from '../../common/events/on-event.decorator';
import { SystemEvent, EventTypes } from '../../common/events/system-event.interface';
import { CriticalAlertService, AlertEventType } from './critical-alert.service';

@Injectable()
export class AlertEventHandler {
  private readonly logger = new Logger(AlertEventHandler.name);

  constructor(
    private readonly criticalAlertService: CriticalAlertService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // CRITICAL ALERTS (Owner + Team Lead)
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.STAFF_SESSION_SUSPICIOUS)
  async handleSuspiciousSession(event: SystemEvent) {
    this.logger.warn(`🚨 ALERT: Suspicious session detected [${event.aggregateId}]`);
    
    try {
      await this.criticalAlertService.emit({
        eventType: AlertEventType.SUSPICIOUS_LOGIN,
        severity: 'critical',
        title: 'Підозріла сесія',
        message: `Виявлено підозрілу активність: ${event.payload.reason || 'unknown'}`,
        data: event.payload,
      });
    } catch (err) {
      this.logger.error('Failed to send suspicious session alert', err);
    }
  }

  @OnSystemEvent(EventTypes.INVOICE_OVERDUE_CRITICAL)
  async handleInvoiceOverdueCritical(event: SystemEvent) {
    this.logger.warn(`🚨 ALERT: Critical invoice overdue [${event.aggregateId}]`);
    
    try {
      await this.criticalAlertService.emit({
        eventType: AlertEventType.INVOICE_OVERDUE,
        severity: 'critical',
        title: 'Критично прострочений рахунок',
        message: `Рахунок ${event.aggregateId} критично прострочений`,
        data: event.payload,
      });
    } catch (err) {
      this.logger.error('Failed to send invoice overdue alert', err);
    }
  }

  @OnSystemEvent(EventTypes.SHIPMENT_STALLED)
  async handleShipmentStalled(event: SystemEvent) {
    this.logger.warn(`🚨 ALERT: Shipment stalled [${event.aggregateId}]`);
    
    try {
      await this.criticalAlertService.emit({
        eventType: AlertEventType.SHIPMENT_STALLED,
        severity: 'high',
        title: 'Доставка зависла',
        message: `Shipment ${event.aggregateId} без оновлень понад 24 години`,
        data: event.payload,
      });
    } catch (err) {
      this.logger.error('Failed to send shipment stalled alert', err);
    }
  }

  @OnSystemEvent(EventTypes.INTEGRATION_DOWN)
  async handleIntegrationDown(event: SystemEvent) {
    this.logger.error(`🚨 ALERT: Integration DOWN [${event.payload.provider}]`);
    
    try {
      await this.criticalAlertService.emit({
        eventType: AlertEventType.INTEGRATION_DOWN,
        severity: 'critical',
        title: 'Інтеграція не працює',
        message: `${event.payload.provider} недоступний: ${event.payload.error}`,
        data: event.payload,
      });
    } catch (err) {
      this.logger.error('Failed to send integration down alert', err);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HIGH PRIORITY ALERTS (Manager + Team Lead)
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.LEAD_HOT)
  async handleHotLead(event: SystemEvent) {
    this.logger.log(`🔥 ALERT: HOT lead [${event.aggregateId}]`);
    // Notify assigned manager immediately
  }

  @OnSystemEvent(EventTypes.TASK_OVERDUE)
  async handleTaskOverdue(event: SystemEvent) {
    this.logger.warn(`⚠️ ALERT: Task overdue [${event.aggregateId}]`);
    // Notify manager and team lead
  }

  @OnSystemEvent(EventTypes.INVOICE_OVERDUE)
  async handleInvoiceOverdue(event: SystemEvent) {
    this.logger.warn(`⚠️ ALERT: Invoice overdue [${event.aggregateId}]`);
    // Start overdue cadence
  }

  // ═══════════════════════════════════════════════════════════
  // POSITIVE ALERTS (Notifications)
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.CONTRACT_SIGNED)
  async handleContractSigned(event: SystemEvent) {
    this.logger.log(`✅ ALERT: Contract signed [${event.aggregateId}]`);
    // Notify manager - can proceed with payment
  }

  @OnSystemEvent(EventTypes.PAYMENT_RECEIVED)
  async handlePaymentReceived(event: SystemEvent) {
    this.logger.log(`💰 ALERT: Payment received [${event.aggregateId}]`);
    // Notify owner + manager
  }

  @OnSystemEvent(EventTypes.SHIPMENT_DELIVERED)
  async handleShipmentDelivered(event: SystemEvent) {
    this.logger.log(`🎉 ALERT: Shipment delivered [${event.aggregateId}]`);
    // Notify owner + manager
  }

  @OnSystemEvent(EventTypes.DEAL_CLOSED_WON)
  async handleDealWon(event: SystemEvent) {
    this.logger.log(`🏆 ALERT: Deal WON [${event.aggregateId}]`);
    // Celebrate! Notify team
  }

  // ═══════════════════════════════════════════════════════════
  // WEBHOOK/SECURITY ALERTS
  // ═══════════════════════════════════════════════════════════

  @OnSystemEvent(EventTypes.WEBHOOK_INVALID_SIGNATURE)
  async handleInvalidWebhook(event: SystemEvent) {
    this.logger.error(`🚨 SECURITY: Invalid webhook signature [${event.payload.provider}]`);
    
    try {
      await this.criticalAlertService.emit({
        eventType: AlertEventType.WEBHOOK_FAILED,
        severity: 'critical',
        title: 'Небезпечний webhook',
        message: `Невалідний підпис webhook від ${event.payload.provider}`,
        data: event.payload,
      });
    } catch (err) {
      this.logger.error('Failed to send webhook security alert', err);
    }
  }
}
