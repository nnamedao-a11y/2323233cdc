import { Injectable, BadRequestException, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from './lead.schema';
import { CreateLeadDto, UpdateLeadDto, LeadQueryDto } from './dto/lead.dto';
import { toObjectResponse, toArrayResponse, generateId } from '../../shared/utils';
import { LeadStatus, AutomationTrigger, ContactStatus } from '../../shared/enums';
import { LEAD_STATUS_TRANSITIONS } from '../../shared/constants/permissions';
import { PaginatedResult } from '../../shared/dto/pagination.dto';
import { AutomationService } from '../automation/automation.service';
import { ActivityService } from '../activity/services/activity.service';
import { ActivityAction, ActivityEntityType } from '../activity/enums/activity-action.enum';
import { DomainEventsService } from '../../infrastructure/events/domain-events.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { EventTypes } from '../../common/events/system-event.interface';

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @Inject(forwardRef(() => AutomationService)) private automationService: AutomationService,
    private activityService: ActivityService,
    @Optional() private domainEvents: DomainEventsService,
    private eventBus: EventBusService,
  ) {}

  async create(createLeadDto: CreateLeadDto, userId: string, userRole?: string, userName?: string): Promise<any> {
    const lead = new this.leadModel({
      id: generateId(),
      ...createLeadDto,
      contactStatus: ContactStatus.NEW_REQUEST,
      createdBy: userId,
    });
    const saved = await lead.save();
    const result = toObjectResponse(saved);

    // Activity log
    this.activityService.logAsync({
      userId,
      userRole: userRole || 'unknown',
      userName,
      action: ActivityAction.LEAD_CREATED,
      entityType: ActivityEntityType.LEAD,
      entityId: result.id,
      meta: { source: createLeadDto.source },
    });

    // Тригеримо автоматизацію
    await this.automationService.emit({
      trigger: AutomationTrigger.LEAD_CREATED,
      entityType: 'lead',
      entityId: result.id,
      data: result,
      userId,
    });

    // Emit domain event for Customer 360 orchestration
    if (this.domainEvents) {
      this.domainEvents.emitLeadCreated({
        leadId: result.id,
        firstName: createLeadDto.firstName || '',
        lastName: createLeadDto.lastName || '',
        phone: createLeadDto.phone,
        email: createLeadDto.email,
        source: createLeadDto.source,
        managerId: createLeadDto.assignedTo,
        vin: (createLeadDto as any).vin || (result as any).vin,
        userId,
      });
    }

    // Emit LEAD_CREATED event for Routing & Cadence engines
    await this.eventBus.emit({
      type: EventTypes.LEAD_CREATED,
      aggregateType: 'lead',
      aggregateId: result.id,
      payload: {
        leadId: result.id,
        firstName: createLeadDto.firstName,
        lastName: createLeadDto.lastName,
        phone: createLeadDto.phone,
        email: createLeadDto.email,
        source: createLeadDto.source,
        assignedTo: createLeadDto.assignedTo,
        country: (createLeadDto as any).country,
        language: (createLeadDto as any).language,
        vin: (createLeadDto as any).vin,
        price: (createLeadDto as any).price,
        intentLevel: (createLeadDto as any).intentLevel,
      },
      actorType: 'manager',
      actorId: userId,
      source: 'api',
    });

    return result;
  }

  async findAll(query: LeadQueryDto): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', search, status, source, assignedTo } = query;

    const filter: any = { isDeleted: false };
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    const [leads, total] = await Promise.all([
      this.leadModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.leadModel.countDocuments(filter),
    ]);

    return {
      data: toArrayResponse(leads),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string): Promise<any> {
    const lead = await this.leadModel.findOne({ id, isDeleted: false });
    return lead ? toObjectResponse(lead) : null;
  }

  async update(id: string, updateLeadDto: UpdateLeadDto, userId: string, userRole?: string, userName?: string): Promise<any> {
    // Validate status transition
    const current = await this.leadModel.findOne({ id, isDeleted: false });
    if (updateLeadDto.status && current) {
      const allowedTransitions = LEAD_STATUS_TRANSITIONS[current.status] || [];
      if (!allowedTransitions.includes(updateLeadDto.status)) {
        throw new BadRequestException(`Cannot transition from ${current.status} to ${updateLeadDto.status}`);
      }
    }

    const lead = await this.leadModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: { ...updateLeadDto, updatedBy: userId } },
      { new: true },
    );

    if (lead) {
      // Activity log
      if (updateLeadDto.status && current?.status !== updateLeadDto.status) {
        this.activityService.logAsync({
          userId,
          userRole: userRole || 'unknown',
          userName,
          action: ActivityAction.LEAD_STATUS_CHANGED,
          entityType: ActivityEntityType.LEAD,
          entityId: id,
          meta: { fromStatus: current?.status, toStatus: updateLeadDto.status },
        });
      } else {
        this.activityService.logAsync({
          userId,
          userRole: userRole || 'unknown',
          userName,
          action: ActivityAction.LEAD_UPDATED,
          entityType: ActivityEntityType.LEAD,
          entityId: id,
        });
      }
    }

    return lead ? toObjectResponse(lead) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.leadModel.findOneAndUpdate(
      { id },
      { $set: { isDeleted: true } },
    );
    return !!result;
  }

  async assign(id: string, assignedTo: string, userId: string, userRole?: string, userName?: string): Promise<any> {
    const current = await this.leadModel.findOne({ id, isDeleted: false });
    const lead = await this.leadModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: { assignedTo, updatedBy: userId } },
      { new: true },
    );
    
    if (lead) {
      const result = toObjectResponse(lead);
      
      // Activity log
      this.activityService.logAsync({
        userId,
        userRole: userRole || 'unknown',
        userName,
        action: current?.assignedTo ? ActivityAction.LEAD_REASSIGNED : ActivityAction.LEAD_ASSIGNED,
        entityType: ActivityEntityType.LEAD,
        entityId: id,
        meta: { assignedTo, assignedFrom: current?.assignedTo },
      });
      
      // Тригеримо автоматизацію
      await this.automationService.emit({
        trigger: AutomationTrigger.LEAD_ASSIGNED,
        entityType: 'lead',
        entityId: result.id,
        data: result,
        userId,
      });
      return result;
    }
    return null;
  }

  async convertToCustomer(id: string, customerId: string): Promise<any> {
    const lead = await this.leadModel.findOneAndUpdate(
      { id, isDeleted: false },
      { 
        $set: { 
          status: LeadStatus.WON, 
          convertedToCustomerId: customerId, 
          convertedAt: new Date() 
        } 
      },
      { new: true },
    );
    return lead ? toObjectResponse(lead) : null;
  }

  async getStats(): Promise<any> {
    const [byStatus, bySource, total] = await Promise.all([
      this.leadModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.leadModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      this.leadModel.countDocuments({ isDeleted: false }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      bySource: bySource.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
    };
  }

  async findDuplicates(email: string): Promise<any[]> {
    const leads = await this.leadModel.find({ email, isDeleted: false });
    return toArrayResponse(leads);
  }
}
