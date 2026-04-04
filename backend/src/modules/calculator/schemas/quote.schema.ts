/**
 * Quote Schema
 * 
 * Зберігає кожен розрахунок як snapshot для CRM/leads
 * + Scenario Pricing System
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuoteDocument = Quote & Document;

@Schema({ timestamps: true })
export class Quote {
  @Prop({ required: true })
  quoteNumber: string; // QT-2024-001234

  @Prop({ index: true })
  vin?: string;

  @Prop()
  lotNumber?: string;

  @Prop()
  vehicleTitle?: string;

  // Input parameters
  @Prop({ required: true, type: Object })
  input: {
    price: number;
    port: string;
    vehicleType: string;
  };

  // Breakdown snapshot
  @Prop({ required: true, type: Object })
  breakdown: {
    carPrice: number;
    auctionFee: number;
    insurance: number;
    usaInland: number;
    ocean: number;
    usaHandlingFee: number;
    bankFee: number;
    euPortHandlingFee: number;
    euDelivery: number;
    companyFee: number;
    customs: number;
    documentationFee: number;
    titleFee: number;
  };

  @Prop({ required: true })
  visibleTotal: number;

  @Prop({ required: true })
  internalTotal: number;

  @Prop({ required: true })
  hiddenFee: number;

  @Prop({ required: true })
  profileCode: string;

  // ============ SCENARIO PRICING ============
  @Prop({ type: Object, default: {} })
  scenarios: {
    minimum?: number;      // -5% від visible
    recommended?: number;  // visible total
    aggressive?: number;   // +10% від visible
  };

  @Prop({ default: 'recommended', enum: ['minimum', 'recommended', 'aggressive'] })
  selectedScenario: string;

  @Prop()
  finalPrice?: number;  // Реально погоджена ціна (може бути override)

  // ============ TRACKING ============
  @Prop({ default: 'vin', enum: ['vin', 'manual', 'admin', 'manager'] })
  createdFrom: string;

  @Prop({ default: false })
  convertedToLead: boolean;

  @Prop()
  customerName?: string;

  @Prop()
  customerPhone?: string;

  @Prop()
  customerEmail?: string;

  // Links
  @Prop({ type: Types.ObjectId, ref: 'Lead', index: true })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  managerId?: Types.ObjectId;

  @Prop({ default: 'draft', enum: ['draft', 'sent', 'accepted', 'expired', 'rejected'] })
  status: string;

  @Prop()
  expiresAt?: Date;

  @Prop()
  notes?: string;

  // ============ AUDIT ============
  @Prop({ type: Array, default: [] })
  history: Array<{
    action: string;
    timestamp: Date;
    userId?: string;
    oldValue?: any;
    newValue?: any;
  }>;
}

export const QuoteSchema = SchemaFactory.createForClass(Quote);

QuoteSchema.index({ quoteNumber: 1 }, { unique: true });
QuoteSchema.index({ vin: 1 });
QuoteSchema.index({ leadId: 1 });
QuoteSchema.index({ status: 1 });
QuoteSchema.index({ createdAt: -1 });
QuoteSchema.index({ customerPhone: 1 });
