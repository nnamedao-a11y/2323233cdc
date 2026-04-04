/**
 * Invoice Schema
 * 
 * Universal invoice engine supporting all payment types
 * Integrated with PaymentFlowState for step blocking
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}

export enum InvoiceType {
  DEPOSIT = 'deposit',
  LOT_PAYMENT = 'lot_payment',
  AUCTION_FEE = 'auction_fee',
  LOGISTICS = 'logistics',
  CUSTOMS = 'customs',
  DELIVERY = 'delivery',
  SERVICE_FEE = 'service_fee',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Invoice extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  // Relations
  @Prop({ required: true, index: true })
  dealId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  managerId: string;

  @Prop({ index: true })
  shipmentId?: string;

  // Customer info (cached)
  @Prop()
  customerId: string;

  @Prop()
  customerName: string;

  @Prop()
  customerEmail: string;

  // Invoice details
  @Prop({ type: String, enum: InvoiceType, required: true, index: true })
  type: InvoiceType;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  // Amount
  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  // Status
  @Prop({ type: String, enum: InvoiceStatus, default: InvoiceStatus.DRAFT, index: true })
  status: InvoiceStatus;

  // Step blocking
  @Prop({ default: true })
  requiredForNextStep: boolean;

  @Prop({ required: true, index: true })
  stepKey: string;

  // Due date
  @Prop()
  dueDate?: Date;

  // Stripe data
  @Prop()
  stripeSessionId?: string;

  @Prop()
  stripePaymentIntentId?: string;

  @Prop()
  stripeCheckoutUrl?: string;

  // Metadata
  @Prop({ type: Object })
  metadata?: Record<string, any>;

  // Reminder tracking
  @Prop({ default: 0 })
  remindersSent: number;

  @Prop()
  lastReminderAt?: Date;

  // Dates
  @Prop()
  sentAt?: Date;

  @Prop()
  paidAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

// Indexes
InvoiceSchema.index({ id: 1 }, { unique: true });
InvoiceSchema.index({ dealId: 1 });
InvoiceSchema.index({ userId: 1 });
InvoiceSchema.index({ managerId: 1 });
InvoiceSchema.index({ shipmentId: 1 });
InvoiceSchema.index({ type: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ stepKey: 1 });
InvoiceSchema.index({ dueDate: 1 });
InvoiceSchema.index({ createdAt: -1 });
InvoiceSchema.index({ stripeSessionId: 1 });
