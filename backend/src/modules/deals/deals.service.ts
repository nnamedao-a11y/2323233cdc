import { Injectable, BadRequestException, NotFoundException, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Deal } from './deal.schema';
import { toObjectResponse, toArrayResponse, generateId } from '../../shared/utils';
import { PaginatedResult } from '../../shared/dto/pagination.dto';
import { DomainEventsService } from '../../infrastructure/events/domain-events.service';
import { BlueprintService } from '../blueprint/blueprint.service';
import { DealStage, DEAL_STAGE_LABELS } from '../blueprint/blueprint-stage.enum';
import { DealContext } from '../blueprint/interfaces/blueprint-transition.interface';
import { EventBusService } from '../event-bus/event-bus.service';
import { EventTypes } from '../../common/events/system-event.interface';

/**
 * Deals Service v3.0 - Blueprint-Integrated
 * 
 * ALL STAGE CHANGES GO THROUGH BLUEPRINT SERVICE
 * Direct stage updates are FORBIDDEN
 */

// Map Blueprint stages to legacy status for backwards compatibility
const STAGE_TO_STATUS: Record<DealStage, string> = {
  [DealStage.NEW_LEAD]: 'new',
  [DealStage.CONTACT_ATTEMPT]: 'new',
  [DealStage.QUALIFIED]: 'negotiation',
  [DealStage.CAR_SELECTED]: 'negotiation',
  [DealStage.NEGOTIATION]: 'negotiation',
  [DealStage.CONTRACT_SENT]: 'waiting_deposit',
  [DealStage.CONTRACT_SIGNED]: 'waiting_deposit',
  [DealStage.PAYMENT_PENDING]: 'waiting_deposit',
  [DealStage.PAYMENT_DONE]: 'deposit_paid',
  [DealStage.SHIPPING]: 'in_delivery',
  [DealStage.DELIVERED]: 'completed',
  [DealStage.CLOSED_LOST]: 'cancelled',
};

@Injectable()
export class DealsService {
  constructor(
    @InjectModel(Deal.name) private dealModel: Model<Deal>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Quote') private quoteModel: Model<any>,
    @Optional() private domainEvents: DomainEventsService,
    @Inject(forwardRef(() => BlueprintService)) private blueprintService: BlueprintService,
    private eventBus: EventBusService,
  ) {}

  // ============ MOVE STAGE (ЕДИНСТВЕННЫЙ СПОСОБ ИЗМЕНИТЬ STAGE) ============
  /**
   * ЕДИНСТВЕННАЯ точка изменения stage
   * Все остальные методы ЗАПРЕЩЕНЫ для изменения stage
   */
  async moveStage(dealId: string, to: DealStage, userId: string, userRole: string = 'manager'): Promise<any> {
    const deal = await this.dealModel.findOne({ id: dealId, isDeleted: false });
    
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    // Build DealContext for Blueprint validation
    const context: DealContext = {
      id: deal.id,
      stage: deal.stage as DealStage,
      managerId: deal.managerId,
      teamLeadId: deal.teamLeadId,
      customerId: deal.customerId,
      vin: deal.vin,
      lotId: deal.lotId,
      hasCalls: deal.hasCalls,
      callCount: deal.callCount,
      contractSigned: deal.contractSigned,
      contractId: deal.contractId,
      invoiceCreated: deal.invoiceCreated,
      depositPaid: deal.depositPaid,
      fullPaymentDone: deal.fullPaymentDone,
      shipmentCreated: deal.shipmentCreated,
      shipmentId: deal.shipmentId,
      shipmentDelivered: deal.shipmentDelivered,
      trackingAdded: deal.trackingAdded,
    };

    // Blueprint validates and emits events
    const result = await this.blueprintService.moveStage(
      context, 
      to, 
      userId, 
      userRole as any
    );

    // Update deal in DB
    const updateData: any = {
      stage: to,
      status: STAGE_TO_STATUS[to] || 'new',
    };

    // Set timestamps based on stage
    const now = new Date();
    switch (to) {
      case DealStage.CONTACT_ATTEMPT:
        updateData.routedAt = deal.routedAt || now;
        break;
      case DealStage.QUALIFIED:
        updateData.qualifiedAt = now;
        break;
      case DealStage.CAR_SELECTED:
        updateData.carSelectedAt = now;
        break;
      case DealStage.NEGOTIATION:
        updateData.negotiationStartedAt = now;
        break;
      case DealStage.CONTRACT_SENT:
        updateData.contractSentAt = now;
        break;
      case DealStage.CONTRACT_SIGNED:
        updateData.contractSignedAt = now;
        break;
      case DealStage.PAYMENT_DONE:
        updateData.depositPaidAt = now;
        break;
      case DealStage.DELIVERED:
        updateData.shipmentDeliveredAt = now;
        updateData.closedAt = now;
        break;
      case DealStage.CLOSED_LOST:
        updateData.closedAt = now;
        updateData.closedReason = 'lost';
        break;
    }

    const updated = await this.dealModel.findOneAndUpdate(
      { id: dealId },
      { $set: updateData },
      { new: true }
    ).lean();

    return {
      success: true,
      deal: updated ? toObjectResponse(updated) : null,
      newStage: to,
      newStageLabel: DEAL_STAGE_LABELS[to],
      validation: result.validation,
    };
  }

  // ============ GET ALLOWED TRANSITIONS ============
  async getAllowedTransitions(dealId: string): Promise<any> {
    const deal = await this.dealModel.findOne({ id: dealId, isDeleted: false });
    if (!deal) throw new NotFoundException('Deal not found');

    const stageInfo = this.blueprintService.getStageInfo(deal.stage as DealStage);

    // Build context for validation
    const context: DealContext = {
      id: deal.id,
      stage: deal.stage as DealStage,
      managerId: deal.managerId,
      customerId: deal.customerId,
      vin: deal.vin,
      lotId: deal.lotId,
      hasCalls: deal.hasCalls,
      callCount: deal.callCount,
      contractSigned: deal.contractSigned,
      invoiceCreated: deal.invoiceCreated,
      depositPaid: deal.depositPaid,
      shipmentCreated: deal.shipmentCreated,
      shipmentDelivered: deal.shipmentDelivered,
    };

    // Validate each transition
    const transitions = await Promise.all(
      stageInfo.allowed.map(async (t) => {
        const blueprint = this.blueprintService.getFullBlueprint().find(
          (b) => b.from === deal.stage && b.to === t.stage
        );

        if (!blueprint) return { ...t, canMove: false, blockers: ['no_transition'] };

        const validation = await this.blueprintService.validateTransition(context, {
          from: deal.stage as DealStage,
          to: t.stage,
          requiredFields: blueprint.requiredFields,
          requiredActions: blueprint.requiredActions,
          blockers: blueprint.blockers,
        });

        return {
          ...t,
          canMove: validation.ok,
          missingFields: validation.missingFields,
          missingActions: validation.missingActions,
          blockers: validation.blockers,
        };
      })
    );

    return {
      current: stageInfo.current,
      transitions,
      deal: toObjectResponse(deal),
    };
  }

  // ============ CREATE FROM LEAD + QUOTE ============
  async createFromLead(data: {
    leadId: string;
    quoteId?: string;
    notes?: string;
  }, userId: string): Promise<any> {
    const lead = await this.leadModel.findOne({ id: data.leadId }).lean();
    if (!lead) throw new NotFoundException('Lead not found');

    let quote: any = null;
    const quoteId = data.quoteId || (lead as any).metadata?.quoteId;
    
    if (quoteId) {
      quote = await this.quoteModel.findOne({
        $or: [{ _id: quoteId }, { quoteNumber: quoteId }]
      }).lean();
    }

    const sourceScenario = quote?.selectedScenario || 'recommended';
    const clientPrice = quote?.scenarios?.[sourceScenario] || quote?.visibleTotal || (lead as any).price || 0;
    const internalCost = quote?.internalTotal || 0;
    const estimatedMargin = internalCost - clientPrice;
    
    const overrideApplied = quote?.history?.some((h: any) => h.action === 'PRICE_OVERRIDE') || false;
    let overrideDelta = 0;
    
    if (overrideApplied && quote?.finalPrice) {
      overrideDelta = (quote.visibleTotal || 0) - quote.finalPrice;
    }

    const deal = new this.dealModel({
      id: generateId(),
      title: quote?.vehicleTitle || `Deal for ${(lead as any).firstName} ${(lead as any).lastName}`,
      customerId: (lead as any).convertedToCustomerId || undefined,
      leadId: String((lead as any)._id || (lead as any).id),
      quoteId: quote?._id ? String(quote._id) : undefined,
      vin: (lead as any).vin || quote?.vin,
      managerId: (lead as any).assignedTo,
      assignedTo: (lead as any).assignedTo,
      
      // Blueprint stage - starts at NEW_LEAD
      stage: DealStage.NEW_LEAD,
      status: 'new',
      
      sourceScenario,
      purchasePrice: quote?.breakdown?.carPrice || 0,
      clientPrice,
      internalCost,
      estimatedMargin,
      value: clientPrice,
      overrideApplied,
      overrideDelta,
      vehicleTitle: quote?.vehicleTitle,
      vehiclePlaceholder: quote?.vehicleTitle || (lead as any).vin,
      notes: data.notes || '',
      createdBy: userId,
    });

    const saved = await deal.save();

    // Update lead
    await this.leadModel.updateOne(
      { id: data.leadId },
      { 
        $set: { 
          status: 'converted',
          convertedToCustomerId: saved.customerId,
          'metadata.dealId': saved.id,
        } 
      }
    );

    // Update quote
    if (quote) {
      await this.quoteModel.updateOne(
        { _id: quote._id },
        { 
          $set: { 
            convertedToLead: true,
            status: 'accepted',
          },
          $push: {
            history: {
              action: 'CONVERTED_TO_DEAL',
              timestamp: new Date(),
              userId,
              newValue: { dealId: saved.id }
            }
          }
        }
      );
    }

    const result = toObjectResponse(saved);

    // Emit deal created event
    await this.eventBus.emit({
      type: EventTypes.DEAL_CREATED,
      aggregateType: 'deal',
      aggregateId: result.id,
      payload: {
        dealId: result.id,
        leadId: data.leadId,
        managerId: (lead as any).assignedTo,
        vin: result.vin,
        clientPrice: result.clientPrice,
        stage: DealStage.NEW_LEAD,
      },
      actorType: 'manager',
      actorId: userId,
      source: 'api',
    });

    // Domain events for backwards compatibility
    if (this.domainEvents) {
      this.domainEvents.emitDealCreated({
        dealId: result.id,
        leadId: data.leadId,
        managerId: (lead as any).assignedTo,
        vin: result.vin || '',
        clientPrice: result.clientPrice || 0,
      });
    }

    return result;
  }

  // ============ STANDARD CRUD ============
  async create(data: any, userId: string): Promise<any> {
    const deal = new this.dealModel({
      id: generateId(),
      ...data,
      stage: DealStage.NEW_LEAD,
      status: 'new',
      createdBy: userId,
    });
    const saved = await deal.save();
    
    await this.eventBus.emit({
      type: EventTypes.DEAL_CREATED,
      aggregateType: 'deal',
      aggregateId: saved.id,
      payload: { dealId: saved.id, stage: DealStage.NEW_LEAD },
      actorType: 'manager',
      actorId: userId,
      source: 'api',
    });

    return toObjectResponse(saved);
  }

  async findAll(query: any): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', status, stage, customerId, assignedTo, leadId, search, managerId } = query;

    const filter: any = { isDeleted: false };
    if (status) filter.status = status;
    if (stage) filter.stage = stage;
    if (customerId) filter.customerId = customerId;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (managerId) filter.managerId = managerId;
    if (leadId) filter.leadId = leadId;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { vin: { $regex: search, $options: 'i' } },
        { vehicleTitle: { $regex: search, $options: 'i' } },
      ];
    }

    const [deals, total] = await Promise.all([
      this.dealModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.dealModel.countDocuments(filter),
    ]);

    return {
      data: toArrayResponse(deals),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string): Promise<any> {
    const deal = await this.dealModel.findOne({ id, isDeleted: false }).lean();
    return deal ? toObjectResponse(deal) : null;
  }

  async findByLeadId(leadId: string): Promise<any> {
    const deal = await this.dealModel.findOne({ leadId, isDeleted: false }).lean();
    return deal ? toObjectResponse(deal) : null;
  }

  // ============ UPDATE (NO STAGE ALLOWED) ============
  async update(id: string, data: any): Promise<any> {
    // FORBIDDEN: direct stage update
    if (data.stage) {
      throw new BadRequestException('Direct stage update is FORBIDDEN. Use moveStage() method.');
    }

    // Allow other updates
    const deal = await this.dealModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: data },
      { new: true },
    ).lean();
    
    return deal ? toObjectResponse(deal) : null;
  }

  // ============ UPDATE FLAGS (for Blueprint validation) ============
  async updateFlags(id: string, flags: {
    contractSigned?: boolean;
    contractId?: string;
    invoiceCreated?: boolean;
    depositPaid?: boolean;
    fullPaymentDone?: boolean;
    shipmentCreated?: boolean;
    shipmentId?: string;
    trackingAdded?: boolean;
    shipmentDelivered?: boolean;
    hasCalls?: boolean;
    callCount?: number;
    lastContactedAt?: Date;
  }): Promise<any> {
    const deal = await this.dealModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: flags },
      { new: true }
    ).lean();
    
    return deal ? toObjectResponse(deal) : null;
  }

  // ============ RECORD CALL ============
  async recordCall(id: string): Promise<any> {
    const deal = await this.dealModel.findOneAndUpdate(
      { id, isDeleted: false },
      { 
        $set: { hasCalls: true, lastContactedAt: new Date() },
        $inc: { callCount: 1 }
      },
      { new: true }
    ).lean();
    
    return deal ? toObjectResponse(deal) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.dealModel.findOneAndUpdate(
      { id }, 
      { $set: { isDeleted: true } }
    );
    return !!result;
  }

  // ============ STATS ============
  async getStats(): Promise<any> {
    const [total, byStage, byStatus, financials] = await Promise.all([
      this.dealModel.countDocuments({ isDeleted: false }),
      this.dealModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$clientPrice' } } },
      ]),
      this.dealModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.dealModel.aggregate([
        { $match: { isDeleted: false } },
        { 
          $group: { 
            _id: null, 
            totalClientPrice: { $sum: '$clientPrice' },
            totalEstimatedMargin: { $sum: '$estimatedMargin' },
            totalRealProfit: { $sum: '$realProfit' },
            completedCount: { $sum: { $cond: [{ $eq: ['$stage', DealStage.DELIVERED] }, 1, 0] } },
            lostCount: { $sum: { $cond: [{ $eq: ['$stage', DealStage.CLOSED_LOST] }, 1, 0] } },
          } 
        },
      ]),
    ]);

    return {
      total,
      totalValue: financials[0]?.totalClientPrice || 0,
      totalEstimatedMargin: financials[0]?.totalEstimatedMargin || 0,
      totalRealProfit: financials[0]?.totalRealProfit || 0,
      completedDeals: financials[0]?.completedCount || 0,
      lostDeals: financials[0]?.lostCount || 0,
      byStage: byStage.reduce((acc, { _id, count, value }) => ({ 
        ...acc, 
        [_id]: { count, value, label: DEAL_STAGE_LABELS[_id as DealStage] || _id } 
      }), {}),
      byStatus: byStatus.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
    };
  }

  // ============ PIPELINE ANALYTICS ============
  async getPipelineAnalytics(): Promise<any> {
    const [leadCount, dealCount, completedCount] = await Promise.all([
      this.leadModel.countDocuments({ isDeleted: { $ne: true } }),
      this.dealModel.countDocuments({ isDeleted: false }),
      this.dealModel.countDocuments({ isDeleted: false, stage: DealStage.DELIVERED }),
    ]);

    // Stage funnel
    const stageFunnel = await this.dealModel.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]);

    // Manager performance
    const managerPerformance = await this.dealModel.aggregate([
      { $match: { isDeleted: false, managerId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$managerId',
          totalDeals: { $sum: 1 },
          completedDeals: { $sum: { $cond: [{ $eq: ['$stage', DealStage.DELIVERED] }, 1, 0] } },
          lostDeals: { $sum: { $cond: [{ $eq: ['$stage', DealStage.CLOSED_LOST] }, 1, 0] } },
          totalClientPrice: { $sum: '$clientPrice' },
          avgScore: { $avg: '$score' },
        }
      },
      { $sort: { totalDeals: -1 } }
    ]);

    return {
      funnel: {
        leads: leadCount,
        deals: dealCount,
        completed: completedCount,
        leadToDealRate: dealCount > 0 && leadCount > 0 ? Math.round((dealCount / leadCount) * 100) : 0,
        dealCompletionRate: completedCount > 0 && dealCount > 0 ? Math.round((completedCount / dealCount) * 100) : 0,
      },
      stageFunnel: stageFunnel.reduce((acc, { _id, count }) => ({
        ...acc,
        [_id]: { count, label: DEAL_STAGE_LABELS[_id as DealStage] || _id }
      }), {}),
      managerPerformance,
    };
  }

  // DEPRECATED: use moveStage instead
  async updateStatus(id: string, newStatus: string, notes?: string): Promise<any> {
    throw new BadRequestException(
      'updateStatus is DEPRECATED. Use moveStage() with Blueprint stages instead.'
    );
  }

  // DEPRECATED: use updateFlags instead
  async bindDeposit(id: string, depositId: string): Promise<any> {
    return this.updateFlags(id, { depositPaid: true });
  }

  async updateFinance(id: string, data: any): Promise<any> {
    const deal = await this.dealModel.findOne({ id, isDeleted: false });
    if (!deal) throw new NotFoundException('Deal not found');

    const updated = await this.dealModel.findOneAndUpdate(
      { id },
      { $set: data },
      { new: true }
    ).lean();

    return updated ? toObjectResponse(updated) : null;
  }
}
