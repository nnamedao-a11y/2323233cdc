/**
 * System Error Log Schema
 * 
 * Централізований лог помилок для всіх модулів
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SystemErrorLogDocument = SystemErrorLog & Document;

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Schema({ timestamps: true, collection: 'system_error_logs' })
export class SystemErrorLog {
  @Prop({ required: true })
  module: string;

  @Prop({ required: true })
  action: string;

  @Prop({ type: Object })
  payload?: Record<string, any>;

  @Prop({ required: true })
  error: string;

  @Prop()
  stackTrace?: string;

  @Prop({ enum: ErrorSeverity, default: ErrorSeverity.MEDIUM })
  severity: ErrorSeverity;

  @Prop({ default: false })
  resolved: boolean;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  resolvedBy?: string;

  @Prop()
  resolution?: string;

  @Prop({ default: false })
  alertSent: boolean;

  @Prop()
  alertSentAt?: Date;

  @Prop({ type: Object })
  context?: Record<string, any>;

  @Prop()
  userId?: string;

  @Prop()
  requestId?: string;
}

export const SystemErrorLogSchema = SchemaFactory.createForClass(SystemErrorLog);

// Indexes
SystemErrorLogSchema.index({ module: 1, action: 1 });
SystemErrorLogSchema.index({ severity: 1 });
SystemErrorLogSchema.index({ resolved: 1 });
SystemErrorLogSchema.index({ createdAt: -1 });
SystemErrorLogSchema.index({ alertSent: 1 });
