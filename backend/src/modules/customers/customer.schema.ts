import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CustomerType } from '../../shared/enums';
import { generateId } from '../../shared/utils';

/**
 * Customer Schema v2.0 - Customer 360
 * 
 * Центр правди для всіх даних клієнта:
 * - Контактна інформація
 * - Агреговані метрики (leads, quotes, deals, deposits)
 * - LTV tracking
 * - Timeline events
 */

@Schema({ timestamps: true })
export class Customer extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, index: true })
  email: string;

  @Prop({ index: true })
  phone?: string;

  @Prop()
  company?: string;

  @Prop({ type: String, enum: CustomerType, default: CustomerType.INDIVIDUAL })
  type: CustomerType;

  @Prop()
  address?: string;

  @Prop()
  city?: string;

  @Prop()
  country?: string;

  @Prop()
  assignedTo?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  leadId?: string;

  // ============ 360 METRICS ============
  @Prop({ type: Number, default: 0 })
  totalLeads: number;

  @Prop({ type: Number, default: 0 })
  totalQuotes: number;

  @Prop({ type: Number, default: 0 })
  totalDeals: number;

  @Prop({ type: Number, default: 0 })
  totalDeposits: number;

  @Prop({ type: Number, default: 0 })
  totalValue: number;     // Total client revenue

  @Prop({ type: Number, default: 0 })
  totalRevenue: number;   // = totalValue (alias)

  @Prop({ type: Number, default: 0 })
  totalProfit: number;    // Actual profit from deals

  @Prop({ type: Number, default: 0 })
  lifetimeValue: number;  // LTV calculation

  // ============ CONVERSION TRACKING ============
  @Prop({ type: Number, default: 0 })
  completedDeals: number;

  @Prop({ type: Number, default: 0 })
  cancelledDeals: number;

  @Prop({ type: Number, default: 0 })
  conversionRate: number;  // deals/leads %

  // ============ ACTIVITY TRACKING ============
  @Prop({ default: null })
  lastInteractionAt?: Date;

  @Prop()
  lastActivityType?: string;

  @Prop()
  lastDealAt?: Date;

  @Prop()
  source?: string;  // First lead source

  // ============ STATUS ============
  @Prop({ default: 'active', enum: ['active', 'inactive', 'vip', 'blacklisted'] })
  status: string;

  @Prop()
  notes?: string;

  // ============ TELEGRAM INTEGRATION ============
  @Prop({ index: true })
  telegramId?: string;

  @Prop({ default: 'bg', enum: ['bg', 'en'] })
  telegramLanguage?: string;

  @Prop()
  telegramLinkedAt?: Date;

  @Prop()
  telegramUnlinkedAt?: Date;

  // ============ VIBER INTEGRATION ============
  @Prop({ index: true })
  viberId?: string;

  @Prop({ default: 'bg', enum: ['bg', 'en'] })
  viberLanguage?: string;

  @Prop()
  viberLinkedAt?: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  // ============ PROFILE ============
  @Prop()
  picture?: string;  // Avatar URL or base64

  @Prop()
  googleId?: string;  // Google OAuth ID

  @Prop()
  authProvider?: string;  // 'google', 'email', etc.

  @Prop()
  createdBy: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ email: 1 });
CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ assignedTo: 1 });
CustomerSchema.index({ type: 1 });
CustomerSchema.index({ status: 1 });
CustomerSchema.index({ lastInteractionAt: -1 });
CustomerSchema.index({ totalProfit: -1 });
