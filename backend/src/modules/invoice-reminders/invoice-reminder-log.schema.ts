/**
 * Invoice Reminder Log Schema
 * 
 * Tracks sent reminders to prevent spam and ensure proper escalation
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ReminderType {
  DUE_24H = 'due_24h',
  DUE_TODAY = 'due_today',
  OVERDUE_1D = 'overdue_1d',
  OVERDUE_3D = 'overdue_3d',
  OVERDUE_5D = 'overdue_5d',
}

export enum ReminderChannel {
  CABINET = 'cabinet',
  EMAIL = 'email',
  TELEGRAM = 'telegram',
}

@Schema({ timestamps: true })
export class InvoiceReminderLog extends Document {
  @Prop({ required: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  invoiceId: string;

  @Prop({ required: true, index: true })
  dealId: string;

  @Prop({ type: String, enum: ReminderType, required: true, index: true })
  reminderType: ReminderType;

  @Prop({ default: false })
  sentToUser: boolean;

  @Prop({ default: false })
  sentToManager: boolean;

  @Prop({ default: false })
  sentToTeamLead: boolean;

  @Prop({ default: false })
  sentToOwner: boolean;

  @Prop({ type: [String], default: [] })
  channels: ReminderChannel[];

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  createdAt: Date;
}

export const InvoiceReminderLogSchema = SchemaFactory.createForClass(InvoiceReminderLog);

InvoiceReminderLogSchema.index({ invoiceId: 1, reminderType: 1 }, { unique: true });
InvoiceReminderLogSchema.index({ createdAt: -1 });
