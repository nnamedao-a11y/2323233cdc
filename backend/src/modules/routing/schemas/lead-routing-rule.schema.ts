/**
 * BIBI Cars - Lead Routing Rule Schema
 * Zoho-style auto-assignment rules
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LeadRoutingRuleDocument = LeadRoutingRule & Document;

@Schema({ timestamps: true })
export class LeadRoutingRule {
  @Prop({ required: true })
  name: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: 100 })
  priority: number;

  @Prop({ type: Object, default: {} })
  conditions: {
    source?: string;
    country?: string;
    language?: string;
    budgetMin?: number;
    budgetMax?: number;
    vehicleType?: string;
    intentLevel?: string;
  };

  @Prop({ required: true, enum: ['manager', 'team', 'queue'] })
  assignToType: string;

  @Prop()
  assignToId?: string;

  @Prop({ default: false })
  useCapacityCheck: boolean;

  @Prop({ default: 30 })
  staleAfterMinutes: number;

  @Prop({ default: 8 })
  maxActiveLeadsPerManager: number;
}

export const LeadRoutingRuleSchema = SchemaFactory.createForClass(LeadRoutingRule);

LeadRoutingRuleSchema.index({ isActive: 1, priority: 1 });
