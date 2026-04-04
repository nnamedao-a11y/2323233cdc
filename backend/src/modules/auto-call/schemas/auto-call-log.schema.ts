/**
 * Auto-Call Log Schema
 * 
 * Лог всіх автодзвінків
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AutoCallLogDocument = AutoCallLog & Document;

export enum CallStatus {
  INITIATED = 'initiated',
  RINGING = 'ringing',
  ANSWERED = 'answered',
  COMPLETED = 'completed',
  FAILED = 'failed',
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
}

@Schema({ timestamps: true })
export class AutoCallLog {
  @Prop({ required: true })
  userId: string;

  @Prop()
  leadId?: string;

  @Prop({ required: true })
  managerPhone: string;

  @Prop()
  twilioCallSid?: string;

  @Prop({ default: CallStatus.INITIATED, enum: CallStatus })
  status: CallStatus;

  @Prop()
  duration?: number;

  @Prop()
  voiceMessage: string;

  @Prop({ type: Object })
  context: {
    intentScore?: number;
    intentLevel?: string;
    lastViewedVin?: string;
    favoriteVins?: string[];
  };

  @Prop()
  errorMessage?: string;

  @Prop()
  answeredAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const AutoCallLogSchema = SchemaFactory.createForClass(AutoCallLog);
AutoCallLogSchema.index({ userId: 1, createdAt: -1 });
AutoCallLogSchema.index({ status: 1 });
AutoCallLogSchema.index({ twilioCallSid: 1 });
