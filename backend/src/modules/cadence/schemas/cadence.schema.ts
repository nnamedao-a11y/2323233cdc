/**
 * BIBI Cars - Cadence Schema
 * Follow-up automation sequences
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CadenceDocument = Cadence & Document;

export interface CadenceStep {
  stepOrder: number;
  delayMinutes: number;
  actionType: 'task' | 'alert' | 'telegram' | 'email' | 'tag';
  payload: Record<string, any>;
}

@Schema({ timestamps: true })
export class Cadence {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, index: true })
  triggerEvent: string;

  @Prop({ required: true, enum: ['lead', 'deal', 'invoice', 'shipment'] })
  entityType: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: [Object], default: [] })
  steps: CadenceStep[];

  @Prop({ type: [String], default: [] })
  stopConditions: string[];

  @Prop()
  description?: string;
}

export const CadenceSchema = SchemaFactory.createForClass(Cadence);

CadenceSchema.index({ triggerEvent: 1, isActive: 1 });
