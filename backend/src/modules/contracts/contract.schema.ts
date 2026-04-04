/**
 * Contract Schema
 * 
 * Stores contracts for e-signature
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ContractStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  VIEWED = 'viewed',
  SIGNED = 'signed',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum ContractType {
  MEDIATION_AGREEMENT = 'mediation_agreement',
  PURCHASE_AGREEMENT = 'purchase_agreement',
  SERVICE_AGREEMENT = 'service_agreement',
  DEPOSIT_AGREEMENT = 'deposit_agreement',
  SHIPPING_AGREEMENT = 'shipping_agreement',
}

@Schema({ timestamps: true })
export class Contract extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true })
  customerId: string;

  @Prop()
  customerName: string;

  @Prop()
  customerEmail: string;

  @Prop()
  dealId: string;

  @Prop()
  leadId: string;

  @Prop({ type: String, enum: ContractType })
  type: ContractType;

  @Prop()
  title: string;

  @Prop()
  description: string;

  @Prop({ type: String, enum: ContractStatus, default: ContractStatus.DRAFT })
  status: ContractStatus;

  // Document data
  @Prop()
  documentUrl: string;

  @Prop()
  signedDocumentUrl: string;

  // DocuSign / eSign data
  @Prop()
  envelopeId: string;

  @Prop()
  signingUrl: string;

  @Prop()
  expiresAt: Date;

  // Vehicle details (for purchase agreement)
  @Prop()
  vin: string;

  @Prop()
  vehicleTitle: string;

  @Prop()
  price: number;

  @Prop({ default: 'usd' })
  currency: string;

  // Metadata
  @Prop({ type: Object })
  metadata: Record<string, any>;

  // Dates
  @Prop()
  sentAt: Date;

  @Prop()
  viewedAt: Date;

  @Prop()
  signedAt: Date;

  @Prop()
  rejectedAt: Date;

  @Prop()
  rejectionReason: string;

  @Prop()
  createdBy: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);

// Indexes
ContractSchema.index({ id: 1 }, { unique: true });
ContractSchema.index({ customerId: 1 });
ContractSchema.index({ dealId: 1 });
ContractSchema.index({ envelopeId: 1 });
ContractSchema.index({ status: 1 });
ContractSchema.index({ createdAt: -1 });
