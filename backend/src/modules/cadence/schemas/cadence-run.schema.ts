/**
 * BIBI Cars - Cadence Run Schema
 * Active cadence execution tracking
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CadenceRunDocument = CadenceRun & Document;

@Schema({ timestamps: true })
export class CadenceRun {
  @Prop({ required: true, index: true })
  cadenceCode: string;

  @Prop({ required: true, index: true })
  entityType: string;

  @Prop({ required: true, index: true })
  entityId: string;

  @Prop({ default: 'active', index: true, enum: ['active', 'completed', 'stopped', 'failed'] })
  status: string;

  @Prop()
  triggerEvent?: string;

  @Prop()
  stoppedReason?: string;

  @Prop({ default: 0 })
  lastExecutedStep: number;

  @Prop({ type: Date, index: true })
  nextExecutionAt?: Date;
}

export const CadenceRunSchema = SchemaFactory.createForClass(CadenceRun);

CadenceRunSchema.index({ status: 1, nextExecutionAt: 1 });
CadenceRunSchema.index({ cadenceCode: 1, entityId: 1, status: 1 });
