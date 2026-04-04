import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomersService } from './customers.service';
import { CustomerTimelineService } from './customer-timeline.service';

/**
 * Customer Orchestration Service
 * 
 * Glue-layer для автоматичного підв'язування customer до:
 * - leads
 * - quotes
 * - deals
 * - deposits
 * 
 * Також керує timeline events та refresh stats
 */

@Injectable()
export class CustomerOrchestrationService {
  private readonly logger = new Logger(CustomerOrchestrationService.name);

  constructor(
    private readonly customersService: CustomersService,
    private readonly timelineService: CustomerTimelineService,
    @InjectModel('Lead') private readonly leadModel: Model<any>,
    @InjectModel('Quote') private readonly quoteModel: Model<any>,
    @InjectModel('Deal') private readonly dealModel: Model<any>,
    @InjectModel('Deposit') private readonly depositModel: Model<any>,
  ) {}

  /**
   * Підв'язує lead до customer (створює customer якщо не існує)
   */
  async attachLeadToCustomer(payload: {
    leadId: string;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    source?: string;
    managerId?: string;
    vin?: string;
  }, userId?: string): Promise<any> {
    try {
      // Find or create customer
      const customer = await this.customersService.findOrCreateByContact({
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        email: payload.email,
        source: payload.source,
        managerId: payload.managerId,
      }, userId);

      const customerId = customer.id;

      // Update lead with customerId
      await this.leadModel.findOneAndUpdate(
        { $or: [{ id: payload.leadId }, { _id: payload.leadId }] },
        { $set: { customerId } },
      );

      // Add timeline event
      await this.timelineService.addEvent({
        customerId,
        type: 'lead_created',
        title: 'Створено lead',
        description: payload.vin ? `VIN: ${payload.vin}` : `${payload.firstName} ${payload.lastName}`,
        entityType: 'lead',
        entityId: payload.leadId,
        managerId: payload.managerId,
        meta: {
          source: payload.source,
          vin: payload.vin,
        },
      });

      // Refresh stats
      await this.customersService.refreshStats(customerId);

      this.logger.log(`Lead ${payload.leadId} attached to customer ${customerId}`);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to attach lead to customer: ${error.message}`);
      return null;
    }
  }

  /**
   * Підв'язує quote до customer
   */
  async attachQuoteToCustomer(payload: {
    quoteId: string;
    leadId?: string;
    customerId?: string;
    vin: string;
    managerId?: string;
    visibleTotal: number;
  }): Promise<string | null> {
    try {
      let customerId = payload.customerId;

      // Get customerId from lead if not provided
      if (!customerId && payload.leadId) {
        const lead = await this.leadModel.findOne({
          $or: [{ id: payload.leadId }, { _id: payload.leadId }],
        }).lean();
        customerId = (lead as any)?.customerId;
      }

      if (!customerId) {
        this.logger.warn(`No customerId found for quote ${payload.quoteId}`);
        return null;
      }

      // Update quote with customerId
      await this.quoteModel.findOneAndUpdate(
        { $or: [{ _id: payload.quoteId }, { quoteNumber: payload.quoteId }] },
        { $set: { customerId } },
      );

      // Add timeline event
      await this.timelineService.addEvent({
        customerId,
        type: 'quote_created',
        title: 'Створено quote',
        description: `VIN: ${payload.vin} | $${payload.visibleTotal.toLocaleString()}`,
        entityType: 'quote',
        entityId: payload.quoteId,
        managerId: payload.managerId,
        meta: {
          vin: payload.vin,
          visibleTotal: payload.visibleTotal,
        },
      });

      // Refresh stats
      await this.customersService.refreshStats(customerId);

      this.logger.log(`Quote ${payload.quoteId} attached to customer ${customerId}`);
      return customerId;
    } catch (error) {
      this.logger.error(`Failed to attach quote to customer: ${error.message}`);
      return null;
    }
  }

  /**
   * Підв'язує deal до customer
   */
  async attachDealToCustomer(payload: {
    dealId: string;
    leadId: string;
    managerId?: string;
    vin: string;
    clientPrice: number;
  }): Promise<string | null> {
    try {
      // Get customerId from lead
      const lead = await this.leadModel.findOne({
        $or: [{ id: payload.leadId }, { _id: payload.leadId }],
      }).lean();
      
      const customerId = (lead as any)?.customerId || (lead as any)?.convertedToCustomerId;
      
      if (!customerId) {
        this.logger.warn(`No customerId found for deal ${payload.dealId}`);
        return null;
      }

      // Update deal with customerId
      await this.dealModel.findOneAndUpdate(
        { $or: [{ id: payload.dealId }, { _id: payload.dealId }] },
        { $set: { customerId } },
      );

      // Add timeline event
      await this.timelineService.addEvent({
        customerId,
        type: 'deal_created',
        title: 'Створено deal',
        description: `VIN: ${payload.vin} | $${payload.clientPrice.toLocaleString()}`,
        entityType: 'deal',
        entityId: payload.dealId,
        managerId: payload.managerId,
        meta: {
          vin: payload.vin,
          clientPrice: payload.clientPrice,
        },
      });

      // Refresh stats
      await this.customersService.refreshStats(customerId);

      this.logger.log(`Deal ${payload.dealId} attached to customer ${customerId}`);
      return customerId;
    } catch (error) {
      this.logger.error(`Failed to attach deal to customer: ${error.message}`);
      return null;
    }
  }

  /**
   * Підв'язує deposit до customer
   */
  async attachDepositToCustomer(payload: {
    depositId: string;
    dealId?: string;
    customerId?: string;
    amount: number;
    managerId?: string;
  }): Promise<string | null> {
    try {
      let customerId = payload.customerId;

      // Get customerId from deal if not provided
      if (!customerId && payload.dealId) {
        const deal = await this.dealModel.findOne({
          $or: [{ id: payload.dealId }, { _id: payload.dealId }],
        }).lean();
        customerId = (deal as any)?.customerId;
      }

      if (!customerId) {
        this.logger.warn(`No customerId found for deposit ${payload.depositId}`);
        return null;
      }

      // Update deposit with customerId
      await this.depositModel.findOneAndUpdate(
        { $or: [{ id: payload.depositId }, { _id: payload.depositId }] },
        { $set: { customerId } },
      );

      // Add timeline event
      await this.timelineService.addEvent({
        customerId,
        type: 'deposit_created',
        title: 'Створено депозит',
        description: `$${payload.amount.toLocaleString()}`,
        entityType: 'deposit',
        entityId: payload.depositId,
        managerId: payload.managerId,
        meta: {
          amount: payload.amount,
        },
      });

      // Refresh stats
      await this.customersService.refreshStats(customerId);

      this.logger.log(`Deposit ${payload.depositId} attached to customer ${customerId}`);
      return customerId;
    } catch (error) {
      this.logger.error(`Failed to attach deposit to customer: ${error.message}`);
      return null;
    }
  }

  /**
   * Додає подію зміни статусу deal
   */
  async addDealStatusEvent(payload: {
    dealId: string;
    status: string;
    managerId?: string;
    notes?: string;
  }): Promise<string | null> {
    try {
      const deal = await this.dealModel.findOne({
        $or: [{ id: payload.dealId }, { _id: payload.dealId }],
      }).lean();
      
      const customerId = (deal as any)?.customerId;
      
      if (!customerId) return null;

      // Add timeline event
      await this.timelineService.addEvent({
        customerId,
        type: 'deal_status_changed',
        title: `Змінено статус deal`,
        description: `Новий статус: ${payload.status}${payload.notes ? ` (${payload.notes})` : ''}`,
        entityType: 'deal',
        entityId: payload.dealId,
        managerId: payload.managerId,
        meta: {
          status: payload.status,
          notes: payload.notes || '',
        },
      });

      // If completed, add special event
      if (payload.status === 'completed') {
        await this.timelineService.addEvent({
          customerId,
          type: 'deal_completed',
          title: 'Deal завершено успішно',
          description: `VIN: ${(deal as any)?.vin || '—'}`,
          entityType: 'deal',
          entityId: payload.dealId,
          managerId: payload.managerId,
        });
      }

      // Refresh stats
      await this.customersService.refreshStats(customerId);

      return customerId;
    } catch (error) {
      this.logger.error(`Failed to add deal status event: ${error.message}`);
      return null;
    }
  }

  /**
   * Додає подію підтвердження депозиту
   */
  async addDepositConfirmedEvent(payload: {
    depositId: string;
    amount: number;
    managerId?: string;
  }): Promise<string | null> {
    try {
      const deposit = await this.depositModel.findOne({
        $or: [{ id: payload.depositId }, { _id: payload.depositId }],
      }).lean();
      
      const customerId = (deposit as any)?.customerId;
      
      if (!customerId) return null;

      // Add timeline event
      await this.timelineService.addEvent({
        customerId,
        type: 'deposit_confirmed',
        title: 'Депозит підтверджено',
        description: `$${payload.amount.toLocaleString()}`,
        entityType: 'deposit',
        entityId: payload.depositId,
        managerId: payload.managerId,
        meta: {
          amount: payload.amount,
        },
      });

      // Refresh stats
      await this.customersService.refreshStats(customerId);

      return customerId;
    } catch (error) {
      this.logger.error(`Failed to add deposit confirmed event: ${error.message}`);
      return null;
    }
  }

  /**
   * Логує дзвінок або повідомлення
   */
  async logCommunication(payload: {
    customerId: string;
    type: 'call_logged' | 'message_sent' | 'note_added';
    title: string;
    description?: string;
    managerId?: string;
    meta?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.timelineService.addEvent({
        customerId: payload.customerId,
        type: payload.type,
        title: payload.title,
        description: payload.description,
        entityType: 'activity',
        managerId: payload.managerId,
        meta: payload.meta,
      });

      // Update last interaction
      await this.customersService.update(payload.customerId, {
        lastInteractionAt: new Date(),
        lastActivityType: payload.type,
      });
    } catch (error) {
      this.logger.error(`Failed to log communication: ${error.message}`);
    }
  }
}
