/**
 * Ringostat Call Schema
 * 
 * Stores all calls from Ringostat webhook
 * Maps: phone → lead → manager
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum CallStatus {
  STARTED = 'started',
  ANSWERED = 'answered',
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
  FAILED = 'failed',
  COMPLETED = 'completed',
}

export enum CallDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

@Schema({ timestamps: true })
export class Call extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  // Ringostat data
  @Prop({ required: true })
  ringostatCallId: string;

  @Prop({ type: String, enum: CallDirection })
  direction: CallDirection;

  @Prop()
  callerPhone: string;

  @Prop()
  receiverPhone: string;

  @Prop()
  managerExtension: string;

  // CRM mapping
  @Prop()
  leadId: string;

  @Prop()
  managerId: string;

  @Prop()
  managerName: string;

  @Prop()
  customerId: string;

  @Prop()
  customerName: string;

  // Call details
  @Prop({ type: String, enum: CallStatus, default: CallStatus.STARTED })
  status: CallStatus;

  @Prop()
  duration: number; // seconds

  @Prop()
  waitTime: number; // seconds

  @Prop()
  talkTime: number; // seconds

  @Prop()
  startedAt: Date;

  @Prop()
  answeredAt: Date;

  @Prop()
  endedAt: Date;

  // Recording
  @Prop()
  recordingUrl: string;

  @Prop({ default: false })
  hasRecording: boolean;

  // Manager notes
  @Prop()
  note: string;

  @Prop()
  outcome: string; // interested, not_interested, callback, no_answer_3x

  @Prop()
  nextActionAt: Date;

  @Prop()
  nextActionType: string;

  // Quality
  @Prop()
  qualityScore: number;

  @Prop({ default: false })
  isHotLead: boolean;

  @Prop({ default: false })
  needsFollowUp: boolean;

  @Prop({ default: false })
  isProcessed: boolean;

  // Metadata
  @Prop({ type: Object })
  rawWebhookData: Record<string, any>;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const CallSchema = SchemaFactory.createForClass(Call);

// Indexes
CallSchema.index({ id: 1 }, { unique: true });
CallSchema.index({ ringostatCallId: 1 }, { unique: true });
CallSchema.index({ leadId: 1 });
CallSchema.index({ managerId: 1 });
CallSchema.index({ customerId: 1 });
CallSchema.index({ callerPhone: 1 });
CallSchema.index({ status: 1 });
CallSchema.index({ startedAt: -1 });
CallSchema.index({ createdAt: -1 });
