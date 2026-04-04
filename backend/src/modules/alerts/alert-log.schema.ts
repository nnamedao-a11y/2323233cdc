/**
 * Alert Log Schema
 * 
 * Stores all critical alerts for audit and retry
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AlertLogDocument = AlertLog & Document;

@Schema({ timestamps: true, collection: 'alert_logs' })
export class AlertLog {
  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ required: true, enum: ['low', 'medium', 'high', 'critical'] })
  severity: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, any>;

  @Prop({ type: [String], default: [] })
  channels: string[];

  @Prop({ default: 'pending', enum: ['pending', 'sent', 'failed', 'failed_permanent'], index: true })
  status: string;

  @Prop()
  lastError?: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  sentAt?: Date;
}

export const AlertLogSchema = SchemaFactory.createForClass(AlertLog);

// Indexes
AlertLogSchema.index({ createdAt: -1 });
AlertLogSchema.index({ status: 1, attempts: 1 });
AlertLogSchema.index({ eventType: 1, createdAt: -1 });
