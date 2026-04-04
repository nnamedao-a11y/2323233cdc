import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { CustomerOrchestrationService } from '../../modules/customers/customer-orchestration.service';

/**
 * Domain Events - Event-based orchestration layer
 * 
 * Events:
 * - lead.created
 * - quote.created
 * - deal.created
 * - deal.statusChanged
 * - deposit.created
 * - deposit.confirmed
 */

// Event payload types
export interface LeadCreatedEvent {
  leadId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  source?: string;
  managerId?: string;
  vin?: string;
  userId?: string;
}

export interface QuoteCreatedEvent {
  quoteId: string;
  leadId?: string;
  customerId?: string;
  vin: string;
  managerId?: string;
  visibleTotal: number;
}

export interface DealCreatedEvent {
  dealId: string;
  leadId: string;
  managerId?: string;
  vin: string;
  clientPrice: number;
}

export interface DealStatusChangedEvent {
  dealId: string;
  status: string;
  managerId?: string;
  notes?: string;
}

export interface DepositCreatedEvent {
  depositId: string;
  dealId?: string;
  customerId?: string;
  amount: number;
  managerId?: string;
}

export interface DepositConfirmedEvent {
  depositId: string;
  amount: number;
  managerId?: string;
}

@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============ EVENT EMITTERS ============

  emitLeadCreated(payload: LeadCreatedEvent) {
    this.logger.log(`Emitting lead.created for ${payload.leadId}`);
    this.eventEmitter.emit('lead.created', payload);
  }

  emitQuoteCreated(payload: QuoteCreatedEvent) {
    this.logger.log(`Emitting quote.created for ${payload.quoteId}`);
    this.eventEmitter.emit('quote.created', payload);
  }

  emitDealCreated(payload: DealCreatedEvent) {
    this.logger.log(`Emitting deal.created for ${payload.dealId}`);
    this.eventEmitter.emit('deal.created', payload);
  }

  emitDealStatusChanged(payload: DealStatusChangedEvent) {
    this.logger.log(`Emitting deal.statusChanged for ${payload.dealId} -> ${payload.status}`);
    this.eventEmitter.emit('deal.statusChanged', payload);
  }

  emitDepositCreated(payload: DepositCreatedEvent) {
    this.logger.log(`Emitting deposit.created for ${payload.depositId}`);
    this.eventEmitter.emit('deposit.created', payload);
  }

  emitDepositConfirmed(payload: DepositConfirmedEvent) {
    this.logger.log(`Emitting deposit.confirmed for ${payload.depositId}`);
    this.eventEmitter.emit('deposit.confirmed', payload);
  }
}

/**
 * Domain Event Listeners - Customer 360 Orchestration Hooks
 */
@Injectable()
export class DomainEventListeners {
  private readonly logger = new Logger(DomainEventListeners.name);

  constructor(
    private readonly orchestration: CustomerOrchestrationService,
  ) {}

  @OnEvent('lead.created')
  async handleLeadCreated(payload: LeadCreatedEvent) {
    this.logger.log(`[Hook] lead.created -> attachLeadToCustomer`);
    try {
      await this.orchestration.attachLeadToCustomer({
        leadId: payload.leadId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        email: payload.email,
        source: payload.source,
        managerId: payload.managerId,
        vin: payload.vin,
      }, payload.userId);
    } catch (error) {
      this.logger.error(`Failed to attach lead to customer: ${error.message}`);
    }
  }

  @OnEvent('quote.created')
  async handleQuoteCreated(payload: QuoteCreatedEvent) {
    this.logger.log(`[Hook] quote.created -> attachQuoteToCustomer`);
    try {
      await this.orchestration.attachQuoteToCustomer({
        quoteId: payload.quoteId,
        leadId: payload.leadId,
        customerId: payload.customerId,
        vin: payload.vin,
        managerId: payload.managerId,
        visibleTotal: payload.visibleTotal,
      });
    } catch (error) {
      this.logger.error(`Failed to attach quote to customer: ${error.message}`);
    }
  }

  @OnEvent('deal.created')
  async handleDealCreated(payload: DealCreatedEvent) {
    this.logger.log(`[Hook] deal.created -> attachDealToCustomer`);
    try {
      await this.orchestration.attachDealToCustomer({
        dealId: payload.dealId,
        leadId: payload.leadId,
        managerId: payload.managerId,
        vin: payload.vin,
        clientPrice: payload.clientPrice,
      });
    } catch (error) {
      this.logger.error(`Failed to attach deal to customer: ${error.message}`);
    }
  }

  @OnEvent('deal.statusChanged')
  async handleDealStatusChanged(payload: DealStatusChangedEvent) {
    this.logger.log(`[Hook] deal.statusChanged -> addDealStatusEvent`);
    try {
      await this.orchestration.addDealStatusEvent({
        dealId: payload.dealId,
        status: payload.status,
        managerId: payload.managerId,
        notes: payload.notes,
      });
    } catch (error) {
      this.logger.error(`Failed to add deal status event: ${error.message}`);
    }
  }

  @OnEvent('deposit.created')
  async handleDepositCreated(payload: DepositCreatedEvent) {
    this.logger.log(`[Hook] deposit.created -> attachDepositToCustomer`);
    try {
      await this.orchestration.attachDepositToCustomer({
        depositId: payload.depositId,
        dealId: payload.dealId,
        customerId: payload.customerId,
        amount: payload.amount,
        managerId: payload.managerId,
      });
    } catch (error) {
      this.logger.error(`Failed to attach deposit to customer: ${error.message}`);
    }
  }

  @OnEvent('deposit.confirmed')
  async handleDepositConfirmed(payload: DepositConfirmedEvent) {
    this.logger.log(`[Hook] deposit.confirmed -> addDepositConfirmedEvent`);
    try {
      await this.orchestration.addDepositConfirmedEvent({
        depositId: payload.depositId,
        amount: payload.amount,
        managerId: payload.managerId,
      });
    } catch (error) {
      this.logger.error(`Failed to add deposit confirmed event: ${error.message}`);
    }
  }
}
