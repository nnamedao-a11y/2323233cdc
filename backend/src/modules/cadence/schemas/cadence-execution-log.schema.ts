/**
 * BIBI Cars - Cadence Execution Log Schema
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CadenceExecutionLogDocument = CadenceExecutionLog & Document;

@Schema({ timestamps: true })
export class CadenceExecutionLog {
  @Prop({ required: true, index: true })
  cadenceRunId: string;

  @Prop({ required: true })
  cadenceCode: string;

  @Prop({ required: true })
  stepOrder: number;

  @Prop({ required: true })
  actionType: string;

  @Prop({ default: 'success', enum: ['success', 'failed', 'skipped'] })
  status: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, any>;

  @Prop()
  error?: string;
}

export const CadenceExecutionLogSchema = SchemaFactory.createForClass(CadenceExecutionLog);

CadenceExecutionLogSchema.index({ cadenceRunId: 1, stepOrder: 1 });
