/**
 * Carfax Manual Flow Schema
 * 
 * User → VIN request → Manager queue → Manual purchase → PDF upload → User gets PDF
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum CarfaxRequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  UPLOADED = 'uploaded',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true })
export class CarfaxRequest extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userName: string;

  @Prop()
  userPhone: string;

  @Prop()
  userEmail: string;

  @Prop({ required: true, length: 17 })
  vin: string;

  @Prop({ type: String, enum: CarfaxRequestStatus, default: CarfaxRequestStatus.PENDING })
  status: CarfaxRequestStatus;

  @Prop()
  managerId: string;

  @Prop()
  managerName: string;

  @Prop()
  pdfUrl: string;

  @Prop()
  pdfFilename: string;

  @Prop()
  rejectReason: string;

  @Prop()
  estimatedCost: number;

  @Prop()
  actualCost: number;

  @Prop()
  processedAt: Date;

  @Prop()
  uploadedAt: Date;

  @Prop()
  rejectedAt: Date;

  @Prop()
  expiresAt: Date;

  @Prop()
  notes: string;

  @Prop({ default: 0 })
  viewCount: number;

  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const CarfaxRequestSchema = SchemaFactory.createForClass(CarfaxRequest);

// Indexes
CarfaxRequestSchema.index({ id: 1 }, { unique: true });
CarfaxRequestSchema.index({ userId: 1 });
CarfaxRequestSchema.index({ vin: 1 });
CarfaxRequestSchema.index({ status: 1 });
CarfaxRequestSchema.index({ managerId: 1 });
CarfaxRequestSchema.index({ createdAt: -1 });
