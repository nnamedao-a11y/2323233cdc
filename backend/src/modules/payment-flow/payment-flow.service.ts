/**
 * Payment Flow Service
 * 
 * Core business logic for payment gates and step blocking
 * 
 * RULES:
 * - Contract must be signed before creating payment invoices
 * - Each required invoice blocks the next step until paid
 * - Shipment tracking only active after lot_paid
 */

import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaymentFlowState, DealStep } from './payment-flow.schema';
import { generateId } from '../../shared/utils';

// Invoice types that are required for step progression
const STEP_REQUIREMENTS = {
  [DealStep.CONTRACT_SIGNED]: [],
  [DealStep.DEPOSIT_PAID]: ['deposit'],
  [DealStep.LOT_PAID]: ['lot_payment'],
  [DealStep.TRANSPORT_TO_PORT]: [],
  [DealStep.AT_ORIGIN_PORT]: [],
  [DealStep.LOADED_ON_VESSEL]: [],
  [DealStep.IN_TRANSIT]: ['logistics'],
  [DealStep.AT_DESTINATION_PORT]: [],
  [DealStep.CUSTOMS]: ['customs'],
  [DealStep.READY_FOR_PICKUP]: [],
  [DealStep.DELIVERED]: ['delivery'],
};

// Steps that require deposit to be paid
const STEPS_BLOCKED_BY_DEPOSIT = [
  DealStep.TRANSPORT_TO_PORT,
  DealStep.AT_ORIGIN_PORT,
  DealStep.LOADED_ON_VESSEL,
  DealStep.IN_TRANSIT,
  DealStep.AT_DESTINATION_PORT,
  DealStep.CUSTOMS,
  DealStep.READY_FOR_PICKUP,
  DealStep.DELIVERED,
];

// Steps that require lot payment
const STEPS_BLOCKED_BY_LOT = [
  DealStep.LOADED_ON_VESSEL,
  DealStep.IN_TRANSIT,
  DealStep.AT_DESTINATION_PORT,
  DealStep.CUSTOMS,
  DealStep.READY_FOR_PICKUP,
  DealStep.DELIVERED,
];

// Steps that require customs payment
const STEPS_BLOCKED_BY_CUSTOMS = [
  DealStep.READY_FOR_PICKUP,
  DealStep.DELIVERED,
];

@Injectable()
export class PaymentFlowService {
  private readonly logger = new Logger(PaymentFlowService.name);

  constructor(
    @InjectModel(PaymentFlowState.name) private flowModel: Model<PaymentFlowState>,
  ) {}

  /**
   * Create a new payment flow state for a deal
   */
  async createFlowState(data: {
    dealId: string;
    userId: string;
    managerId?: string;
  }): Promise<PaymentFlowState> {
    const existing = await this.flowModel.findOne({ dealId: data.dealId });
    if (existing) {
      return existing;
    }

    const flow = new this.flowModel({
      id: generateId(),
      ...data,
      currentStep: DealStep.DEAL_CREATED,
    });

    await flow.save();
    this.logger.log(`Payment flow created for deal ${data.dealId}`);
    return flow;
  }

  /**
   * Get flow state by deal ID
   */
  async getFlowState(dealId: string): Promise<PaymentFlowState | null> {
    return this.flowModel.findOne({ dealId });
  }

  /**
   * Get flow state or throw
   */
  async getFlowStateOrThrow(dealId: string): Promise<PaymentFlowState> {
    const flow = await this.flowModel.findOne({ dealId });
    if (!flow) {
      throw new NotFoundException(`Payment flow not found for deal ${dealId}`);
    }
    return flow;
  }

  /**
   * Check if invoice can be created
   * Rule: Contract must be signed first
   */
  async canCreateInvoice(dealId: string): Promise<{ allowed: boolean; reason?: string }> {
    const flow = await this.getFlowState(dealId);
    
    if (!flow) {
      return { allowed: false, reason: 'Deal flow not initialized' };
    }

    if (!flow.contractSigned) {
      return { allowed: false, reason: 'Contract must be signed first' };
    }

    return { allowed: true };
  }

  /**
   * Assert that invoice creation is allowed (throws if not)
   */
  async assertCanCreateInvoice(dealId: string): Promise<void> {
    const check = await this.canCreateInvoice(dealId);
    if (!check.allowed) {
      throw new ForbiddenException(check.reason);
    }
  }

  /**
   * Check if a shipment status change is allowed
   */
  async canChangeShipmentStatus(dealId: string, newStatus: DealStep): Promise<{ allowed: boolean; reason?: string }> {
    const flow = await this.getFlowState(dealId);
    
    if (!flow) {
      return { allowed: false, reason: 'Deal flow not initialized' };
    }

    // Check deposit gate
    if (STEPS_BLOCKED_BY_DEPOSIT.includes(newStatus) && !flow.depositPaid) {
      return { allowed: false, reason: 'Deposit invoice must be paid first' };
    }

    // Check lot payment gate
    if (STEPS_BLOCKED_BY_LOT.includes(newStatus) && !flow.lotPaid) {
      return { allowed: false, reason: 'Lot payment invoice must be paid first' };
    }

    // Check customs gate
    if (STEPS_BLOCKED_BY_CUSTOMS.includes(newStatus) && !flow.customsPaid) {
      return { allowed: false, reason: 'Customs invoice must be paid first' };
    }

    return { allowed: true };
  }

  /**
   * Assert that shipment status change is allowed (throws if not)
   */
  async assertCanChangeShipmentStatus(dealId: string, newStatus: DealStep): Promise<void> {
    const check = await this.canChangeShipmentStatus(dealId, newStatus);
    if (!check.allowed) {
      throw new ForbiddenException(check.reason);
    }
  }

  /**
   * Mark contract as signed
   */
  async markContractSigned(dealId: string): Promise<PaymentFlowState> {
    const flow = await this.getFlowStateOrThrow(dealId);
    
    flow.contractSigned = true;
    flow.contractSignedAt = new Date();
    flow.currentStep = DealStep.CONTRACT_SIGNED;
    flow.nextAllowedStep = DealStep.DEPOSIT_PAID;
    flow.blockedReason = undefined;

    await flow.save();
    this.logger.log(`Contract signed for deal ${dealId}`);
    return flow;
  }

  /**
   * Update flow state after invoice is paid
   */
  async onInvoicePaid(dealId: string, invoiceType: string, invoiceId: string, amount: number): Promise<PaymentFlowState> {
    const flow = await this.getFlowStateOrThrow(dealId);

    // Add to paid invoices
    if (!flow.paidInvoiceIds.includes(invoiceId)) {
      flow.paidInvoiceIds.push(invoiceId);
    }

    // Remove from pending
    flow.pendingInvoiceIds = flow.pendingInvoiceIds.filter(id => id !== invoiceId);

    // Update totals
    flow.totalPaid += amount;
    flow.lastPaymentAt = new Date();

    // Update specific payment gates based on invoice type
    switch (invoiceType) {
      case 'deposit':
        flow.depositPaid = true;
        flow.depositPaidAt = new Date();
        flow.currentStep = DealStep.DEPOSIT_PAID;
        flow.nextAllowedStep = DealStep.LOT_PAID;
        break;

      case 'lot_payment':
        flow.lotPaid = true;
        flow.lotPaidAt = new Date();
        flow.currentStep = DealStep.LOT_PAID;
        flow.nextAllowedStep = DealStep.TRANSPORT_TO_PORT;
        break;

      case 'auction_fee':
        flow.auctionFeePaid = true;
        break;

      case 'logistics':
        flow.logisticsPaid = true;
        break;

      case 'customs':
        flow.customsPaid = true;
        flow.nextAllowedStep = DealStep.READY_FOR_PICKUP;
        break;

      case 'delivery':
        flow.deliveryPaid = true;
        break;
    }

    flow.blockedReason = undefined;
    await flow.save();

    this.logger.log(`Invoice ${invoiceType} paid for deal ${dealId}, new step: ${flow.currentStep}`);
    return flow;
  }

  /**
   * Add invoice to pending list
   */
  async onInvoiceCreated(dealId: string, invoiceId: string, amount: number): Promise<void> {
    const flow = await this.getFlowState(dealId);
    if (!flow) return;

    if (!flow.pendingInvoiceIds.includes(invoiceId)) {
      flow.pendingInvoiceIds.push(invoiceId);
    }
    flow.totalDue += amount;
    await flow.save();
  }

  /**
   * Mark invoice as overdue
   */
  async onInvoiceOverdue(dealId: string, invoiceId: string, amount: number): Promise<void> {
    const flow = await this.getFlowState(dealId);
    if (!flow) return;

    if (!flow.overdueInvoiceIds.includes(invoiceId)) {
      flow.overdueInvoiceIds.push(invoiceId);
    }
    flow.totalOverdue += amount;
    flow.blockedReason = 'Overdue invoice requires payment';
    await flow.save();
  }

  /**
   * Update current step (for shipment status sync)
   */
  async updateCurrentStep(dealId: string, step: DealStep): Promise<PaymentFlowState> {
    const flow = await this.getFlowStateOrThrow(dealId);
    
    // First check if this step change is allowed
    await this.assertCanChangeShipmentStatus(dealId, step);

    flow.currentStep = step;
    await flow.save();

    return flow;
  }

  /**
   * Check if tracking should be active for a deal
   */
  async isTrackingActive(dealId: string): Promise<boolean> {
    const flow = await this.getFlowState(dealId);
    if (!flow) return false;

    // Tracking becomes active after lot is paid
    return flow.lotPaid;
  }

  /**
   * Get all blocked deals (for admin dashboard)
   */
  async getBlockedDeals(): Promise<PaymentFlowState[]> {
    return this.flowModel.find({
      $or: [
        { blockedReason: { $exists: true, $ne: null } },
        { 'overdueInvoiceIds.0': { $exists: true } },
      ],
    }).sort({ updatedAt: -1 });
  }

  /**
   * Get flow summary for user
   */
  async getUserFlowSummary(userId: string): Promise<any[]> {
    const flows = await this.flowModel.find({ userId }).sort({ updatedAt: -1 });
    return flows.map(f => ({
      dealId: f.dealId,
      currentStep: f.currentStep,
      contractSigned: f.contractSigned,
      depositPaid: f.depositPaid,
      lotPaid: f.lotPaid,
      customsPaid: f.customsPaid,
      totalPaid: f.totalPaid,
      totalDue: f.totalDue,
      totalOverdue: f.totalOverdue,
      blockedReason: f.blockedReason,
      nextAllowedStep: f.nextAllowedStep,
    }));
  }
}
