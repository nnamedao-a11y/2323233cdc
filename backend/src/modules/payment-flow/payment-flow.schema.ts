/**
 * Payment Flow State Schema
 * 
 * Tracks the payment/deal lifecycle state
 * Controls what steps are blocked/allowed based on payments
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum DealStep {
  DEAL_CREATED = 'deal_created',
  CONTRACT_SIGNED = 'contract_signed',
  DEPOSIT_PAID = 'deposit_paid',
  LOT_PAID = 'lot_paid',
  TRANSPORT_TO_PORT = 'transport_to_port',
  AT_ORIGIN_PORT = 'at_origin_port',
  LOADED_ON_VESSEL = 'loaded_on_vessel',
  IN_TRANSIT = 'in_transit',
  AT_DESTINATION_PORT = 'at_destination_port',
  CUSTOMS = 'customs',
  READY_FOR_PICKUP = 'ready_for_pickup',
  DELIVERED = 'delivered',
}

@Schema({ timestamps: true })
export class PaymentFlowState extends Document {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, unique: true, index: true })
  dealId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ index: true })
  managerId: string;

  // Current step in the flow
  @Prop({ type: String, enum: DealStep, default: DealStep.DEAL_CREATED })
  currentStep: DealStep;

  // Blocking info
  @Prop()
  blockedReason?: string;

  @Prop()
  nextAllowedStep?: string;

  // Payment gates
  @Prop({ default: false })
  contractSigned: boolean;

  @Prop({ default: false })
  depositPaid: boolean;

  @Prop({ default: false })
  lotPaid: boolean;

  @Prop({ default: false })
  auctionFeePaid: boolean;

  @Prop({ default: false })
  logisticsPaid: boolean;

  @Prop({ default: false })
  customsPaid: boolean;

  @Prop({ default: false })
  deliveryPaid: boolean;

  // Amounts paid
  @Prop({ default: 0 })
  totalPaid: number;

  @Prop({ default: 0 })
  totalDue: number;

  @Prop({ default: 0 })
  totalOverdue: number;

  // Invoice IDs
  @Prop({ type: [String], default: [] })
  paidInvoiceIds: string[];

  @Prop({ type: [String], default: [] })
  pendingInvoiceIds: string[];

  @Prop({ type: [String], default: [] })
  overdueInvoiceIds: string[];

  // Dates
  @Prop()
  contractSignedAt?: Date;

  @Prop()
  depositPaidAt?: Date;

  @Prop()
  lotPaidAt?: Date;

  @Prop()
  lastPaymentAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PaymentFlowStateSchema = SchemaFactory.createForClass(PaymentFlowState);

// Indexes
PaymentFlowStateSchema.index({ dealId: 1 }, { unique: true });
PaymentFlowStateSchema.index({ userId: 1 });
PaymentFlowStateSchema.index({ currentStep: 1 });
PaymentFlowStateSchema.index({ 'paidInvoiceIds': 1 });
