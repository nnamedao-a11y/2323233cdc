/**
 * VIN Lead Service
 * 
 * Auto-lead creation logic:
 * 1. Create/find customer
 * 2. Create lead with VIN data
 * 3. Create tasks for manager
 * 4. Send notifications
 * 5. Track A/B variant
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from './lead.schema';
import { generateId } from '../../shared/utils';
import { LeadStatus, LeadSource, ContactStatus } from '../../shared/enums';
import { TasksService } from '../tasks/tasks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CustomersService } from '../customers/customers.service';

export interface VinLeadInput {
  vin: string;
  maxBid?: number;
  finalPrice?: number;
  marketPrice?: number;
  dealStatus?: string;
  vehicle?: {
    make?: string;
    model?: string;
    year?: number;
    damage?: string;
  };
  phone?: string;
  email?: string;
  firstName?: string;
  userId?: string;
  customerId?: string;
  variant?: 'A' | 'B';
  ip?: string;
  userAgent?: string;
}

export interface VinLeadResult {
  success: boolean;
  leadId: string;
  customerId?: string;
  message: string;
  tasksCreated: number;
  notificationsSent: number;
}

@Injectable()
export class VinLeadService {
  private readonly logger = new Logger(VinLeadService.name);

  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @Inject(forwardRef(() => TasksService)) private tasksService: TasksService,
    @Inject(forwardRef(() => NotificationsService)) private notificationsService: NotificationsService,
    @Inject(forwardRef(() => CustomersService)) private customersService: CustomersService,
  ) {}

  /**
   * Main entry point - create lead from VIN
   */
  async createFromVin(input: VinLeadInput): Promise<VinLeadResult> {
    const startTime = Date.now();
    this.logger.log(`[VinLead] Processing VIN: ${input.vin}, variant: ${input.variant || 'none'}`);

    try {
      // 1. Find or create customer
      let customerId = input.customerId;
      if (!customerId && (input.phone || input.email)) {
        customerId = await this.findOrCreateCustomer(input);
      }

      // 2. Create lead
      const leadId = generateId();
      const vehicleTitle = this.buildVehicleTitle(input.vehicle);
      
      // Determine priority based on deal status
      const isHighIntent = input.dealStatus === 'GOOD_DEAL' || input.dealStatus === 'OK_DEAL';
      
      const lead = new this.leadModel({
        id: leadId,
        firstName: input.firstName || 'VIN',
        lastName: 'Lead',
        phone: input.phone,
        email: input.email,
        status: LeadStatus.NEW,
        contactStatus: ContactStatus.NEW_REQUEST,
        source: LeadSource.VIN_ENGINE || 'vin_engine',
        vin: input.vin,
        price: input.finalPrice,
        value: input.finalPrice,
        description: this.buildDescription(input),
        metadata: {
          vin: input.vin,
          maxBid: input.maxBid,
          finalPrice: input.finalPrice,
          marketPrice: input.marketPrice,
          dealStatus: input.dealStatus,
          vehicle: input.vehicle,
          variant: input.variant,
          isHighIntent,
          ip: input.ip,
          userAgent: input.userAgent,
          createdFrom: 'vin_search',
          timestamp: new Date().toISOString(),
        },
        tags: [
          'vin-search',
          input.dealStatus?.toLowerCase() || 'unknown',
          isHighIntent ? 'high-intent' : 'normal-intent',
          input.variant ? `variant-${input.variant}` : '',
        ].filter(Boolean),
        createdBy: input.userId || 'system',
      });

      await lead.save();
      this.logger.log(`[VinLead] Lead created: ${leadId}`);

      // 3. Create tasks for manager
      let tasksCreated = 0;
      try {
        tasksCreated = await this.createLeadTasks(leadId, input, isHighIntent);
      } catch (err) {
        this.logger.warn(`[VinLead] Task creation failed: ${err.message}`);
      }

      // 4. Send notifications
      let notificationsSent = 0;
      try {
        notificationsSent = await this.notifyManagers(leadId, input, isHighIntent);
      } catch (err) {
        this.logger.warn(`[VinLead] Notification failed: ${err.message}`);
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `[VinLead] Complete in ${duration}ms: lead=${leadId}, tasks=${tasksCreated}, notifs=${notificationsSent}`
      );

      return {
        success: true,
        leadId,
        customerId,
        message: isHighIntent 
          ? 'Заявку створено! Менеджер зв\'яжеться протягом 10 хвилин.' 
          : 'Заявку створено! Менеджер зв\'яжеться протягом 15 хвилин.',
        tasksCreated,
        notificationsSent,
      };

    } catch (error: any) {
      this.logger.error(`[VinLead] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find or create customer
   */
  private async findOrCreateCustomer(input: VinLeadInput): Promise<string | undefined> {
    try {
      // Use existing findOrCreateByContact
      const customer = await this.customersService.findOrCreateByContact({
        firstName: input.firstName || 'Потенційний',
        lastName: 'Клієнт',
        phone: input.phone,
        email: input.email,
        source: 'vin_search',
      }, 'system');

      return customer?.id;
    } catch (err) {
      this.logger.warn(`[VinLead] Customer creation failed: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Create tasks for manager
   */
  private async createLeadTasks(
    leadId: string, 
    input: VinLeadInput,
    isHighIntent: boolean
  ): Promise<number> {
    const vehicleTitle = this.buildVehicleTitle(input.vehicle);
    
    // Task 1: Contact client (urgent for high intent)
    const task1 = {
      title: isHighIntent 
        ? `🔥 ТЕРМІНОВО: Зв'язатися з клієнтом - ${vehicleTitle}`
        : `Зв'язатися з клієнтом - ${vehicleTitle}`,
      description: `VIN: ${input.vin}\nMax Bid: $${input.maxBid}\nFinal Price: $${input.finalPrice}\n\nКлієнт шукав це авто і хоче купити.`,
      priority: isHighIntent ? 'urgent' : 'high',
      dueDate: new Date(Date.now() + (isHighIntent ? 10 : 15) * 60 * 1000), // 10 or 15 minutes
      relatedTo: { type: 'lead', id: leadId },
      tags: ['vin-lead', isHighIntent ? 'hot' : 'warm'],
    };

    // Task 2: Send offer (after contact)
    const task2 = {
      title: `Відправити пропозицію - ${vehicleTitle}`,
      description: `Підготувати та відправити комерційну пропозицію по авто.\n\nMarket: $${input.marketPrice}\nОур Price: $${input.finalPrice}`,
      priority: 'medium',
      dueDate: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      relatedTo: { type: 'lead', id: leadId },
      tags: ['vin-lead', 'offer'],
    };

    let created = 0;
    try {
      await this.tasksService.create(task1, 'system');
      created++;
    } catch (err) {
      this.logger.warn(`[VinLead] Task 1 creation error: ${err.message}`);
    }
    
    try {
      await this.tasksService.create(task2, 'system');
      created++;
    } catch (err) {
      this.logger.warn(`[VinLead] Task 2 creation error: ${err.message}`);
    }

    return created;
  }

  /**
   * Notify managers about new lead
   */
  private async notifyManagers(
    leadId: string,
    input: VinLeadInput,
    isHighIntent: boolean
  ): Promise<number> {
    const vehicleTitle = this.buildVehicleTitle(input.vehicle);
    
    const message = isHighIntent
      ? `🔥 HOT LEAD!\n\n${vehicleTitle}\nVIN: ${input.vin}\n\nMax Bid: $${input.maxBid}\nFinal: $${input.finalPrice}\n\n⚡ ТЕРМІНОВО ЗАТЕЛЕФОНУВАТИ!`
      : `📥 New Lead\n\n${vehicleTitle}\nVIN: ${input.vin}\n\nMax Bid: $${input.maxBid}\nFinal: $${input.finalPrice}`;

    try {
      await this.notificationsService.notifyAdmins({
        title: isHighIntent ? '🔥 HOT VIN Lead' : '📥 New VIN Lead',
        message,
        type: 'new_lead' as any,
        priority: isHighIntent ? 'urgent' : 'high',
      });
      return 1;
    } catch (err) {
      this.logger.warn(`[VinLead] Notification error: ${err.message}`);
      return 0;
    }
  }

  /**
   * Build vehicle title
   */
  private buildVehicleTitle(vehicle?: VinLeadInput['vehicle']): string {
    if (!vehicle) return 'Unknown Vehicle';
    return `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Unknown Vehicle';
  }

  /**
   * Build description
   */
  private buildDescription(input: VinLeadInput): string {
    const lines = [
      `VIN Search Lead`,
      ``,
      `VIN: ${input.vin}`,
      `Vehicle: ${this.buildVehicleTitle(input.vehicle)}`,
      ``,
      `Pricing:`,
      `- Market Price: $${input.marketPrice || 'N/A'}`,
      `- Max Bid: $${input.maxBid || 'N/A'}`,
      `- Final Price: $${input.finalPrice || 'N/A'}`,
      ``,
      `Deal Status: ${input.dealStatus || 'Unknown'}`,
    ];

    if (input.vehicle?.damage) {
      lines.push(`Damage: ${input.vehicle.damage}`);
    }

    if (input.variant) {
      lines.push(``, `A/B Variant: ${input.variant}`);
    }

    return lines.join('\n');
  }

  /**
   * Get leads by VIN
   */
  async findByVin(vin: string): Promise<Lead[]> {
    return this.leadModel.find({ vin, isDeleted: false }).sort({ createdAt: -1 }).exec();
  }

  /**
   * Get A/B test stats
   */
  async getABStats(): Promise<any> {
    const pipeline = [
      { $match: { 'metadata.createdFrom': 'vin_search', isDeleted: false } },
      {
        $group: {
          _id: '$metadata.variant',
          total: { $sum: 1 },
          converted: { $sum: { $cond: [{ $ne: ['$convertedToCustomerId', null] }, 1, 0] } },
          avgValue: { $avg: '$value' },
        },
      },
    ];

    const results = await this.leadModel.aggregate(pipeline);
    
    const stats: Record<string, any> = {};
    for (const r of results) {
      const variant = r._id || 'none';
      stats[variant] = {
        total: r.total,
        converted: r.converted,
        conversionRate: r.total > 0 ? (r.converted / r.total * 100).toFixed(1) : 0,
        avgValue: Math.round(r.avgValue || 0),
      };
    }

    return stats;
  }
}
