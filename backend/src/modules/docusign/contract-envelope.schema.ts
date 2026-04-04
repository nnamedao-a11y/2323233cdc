/**
 * DocuSign Contract Envelope Schema
 * 
 * Tracks DocuSign envelope lifecycle
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContractEnvelopeDocument = ContractEnvelope & Document;

export enum EnvelopeStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  DECLINED = 'declined',
  VOIDED = 'voided',
  ERROR = 'error',
}

@Schema({ timestamps: true })
export class ContractEnvelope {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  contractId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop()
  dealId: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  fullName: string;

  @Prop({ index: true })
  envelopeId: string;

  @Prop()
  documentUrl: string;

  @Prop({ type: String, enum: EnvelopeStatus, default: EnvelopeStatus.DRAFT })
  status: EnvelopeStatus;

  @Prop()
  signedPdfUrl: string;

  @Prop()
  clientUserId: string;

  @Prop()
  sentAt: Date;

  @Prop()
  deliveredAt: Date;

  @Prop()
  completedAt: Date;

  @Prop()
  declinedAt: Date;

  @Prop()
  declineReason: string;

  @Prop({ type: Object, default: {} })
  meta: Record<string, any>;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ContractEnvelopeSchema = SchemaFactory.createForClass(ContractEnvelope);

ContractEnvelopeSchema.index({ envelopeId: 1 });
ContractEnvelopeSchema.index({ contractId: 1 });
ContractEnvelopeSchema.index({ status: 1 });
