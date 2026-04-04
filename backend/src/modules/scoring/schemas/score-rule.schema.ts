/**
 * BIBI Cars - Score Rule Schema
 * Configurable scoring rules stored in DB
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ScoreRuleDocument = ScoreRule & Document;

@Schema({ timestamps: true, collection: 'score_rules' })
export class ScoreRule {
  @Prop({ required: true, index: true })
  scoreType: 'lead_score' | 'deal_health' | 'manager_performance' | 'shipment_risk';

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true })
  points: number;

  @Prop({ type: Object, default: {} })
  condition: {
    field?: string;
    operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'exists';
    value?: any;
    event?: string;
  };

  @Prop()
  description?: string;

  @Prop({ default: 0 })
  hitCount: number;

  @Prop()
  lastHitAt?: Date;
}

export const ScoreRuleSchema = SchemaFactory.createForClass(ScoreRule);

ScoreRuleSchema.index({ scoreType: 1, isActive: 1 });
