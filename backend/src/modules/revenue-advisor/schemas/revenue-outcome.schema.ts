/**
 * Revenue Outcome Schema
 * 
 * Логування результатів рекомендацій для learning
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RevenueOutcomeDocument = RevenueOutcome & Document;

@Schema({ timestamps: true })
export class RevenueOutcome {
  @Prop({ required: true })
  leadId: string;

  @Prop({ required: true })
  userId: string;

  @Prop()
  managerId?: string;

  @Prop()
  vin?: string;

  // Pricing data
  @Prop()
  marketPrice?: number;

  @Prop()
  finalPrice?: number;

  @Prop()
  maxBid?: number;

  @Prop()
  netProfit?: number;

  // User behavior data
  @Prop()
  intentScore?: number;

  @Prop()
  intentLevel?: string; // hot, warm, cold

  @Prop()
  compareCount?: number;

  @Prop()
  favoritesCount?: number;

  // AI recommendation
  @Prop()
  suggestedAction?: string; // close_now, push, hold, educate

  @Prop()
  suggestedDiscount?: number;

  @Prop()
  confidence?: number;

  // Actual action taken
  @Prop()
  actionTaken?: string;

  @Prop()
  actualDiscount?: number;

  // Outcome
  @Prop({ default: false })
  wasContacted: boolean;

  @Prop({ default: false })
  becameQualified: boolean;

  @Prop({ default: false })
  becameDeal: boolean;

  @Prop({ default: false })
  becameDeposit: boolean;

  @Prop()
  dealValue?: number;

  @Prop()
  depositValue?: number;

  // Timing
  @Prop()
  contactedAt?: Date;

  @Prop()
  qualifiedAt?: Date;

  @Prop()
  dealAt?: Date;

  @Prop()
  depositAt?: Date;

  // Buckets for pattern analysis
  @Prop()
  intentBucket?: string; // hot, warm, cold

  @Prop()
  compareBucket?: string; // single, compare

  @Prop()
  profitBucket?: string; // low, medium, high
}

export const RevenueOutcomeSchema = SchemaFactory.createForClass(RevenueOutcome);
RevenueOutcomeSchema.index({ leadId: 1 }, { unique: true });
RevenueOutcomeSchema.index({ userId: 1 });
RevenueOutcomeSchema.index({ becameDeal: 1 });
RevenueOutcomeSchema.index({ intentBucket: 1, compareBucket: 1, actualDiscount: 1 });
