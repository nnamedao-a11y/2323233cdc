/**
 * Invoice Escalation State Schema
 * 
 * Tracks escalation level for overdue invoices
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class InvoiceEscalationState extends Document {
  @Prop({ required: true, unique: true, index: true })
  invoiceId: string;

  @Prop({ required: true, index: true })
  dealId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  managerId: string;

  // 0 = not escalated, 1 = manager, 2 = team lead, 3 = owner
  @Prop({ default: 0 })
  escalationLevel: number;

  @Prop()
  lastEscalatedAt?: Date;

  @Prop()
  resolvedAt?: Date;

  @Prop({ default: false })
  criticalOverdue: boolean;

  @Prop()
  daysOverdue: number;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const InvoiceEscalationStateSchema = SchemaFactory.createForClass(InvoiceEscalationState);

InvoiceEscalationStateSchema.index({ invoiceId: 1 }, { unique: true });
InvoiceEscalationStateSchema.index({ escalationLevel: 1 });
InvoiceEscalationStateSchema.index({ criticalOverdue: 1 });
