/**
 * Revenue Pattern Schema
 * 
 * Збережені патерни для швидкого доступу
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RevenuePatternDocument = RevenuePattern & Document;

@Schema({ timestamps: true })
export class RevenuePattern {
  @Prop({ required: true })
  patternKey: string; // e.g., "hot_compare_medium"

  @Prop()
  intentBucket: string;

  @Prop()
  compareBucket: string;

  @Prop()
  profitBucket: string;

  @Prop()
  bestDiscount: number;

  @Prop()
  dealRate: number;

  @Prop()
  depositRate: number;

  @Prop()
  avgProfit: number;

  @Prop()
  sampleSize: number;

  @Prop()
  lastUpdatedAt: Date;
}

export const RevenuePatternSchema = SchemaFactory.createForClass(RevenuePattern);
RevenuePatternSchema.index({ patternKey: 1 }, { unique: true });
