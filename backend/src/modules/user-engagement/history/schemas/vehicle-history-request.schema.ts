/**
 * Vehicle History Request Schema
 * 
 * Логування запитів на history reports
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VehicleHistoryRequestDocument = VehicleHistoryRequest & Document;

@Schema({ timestamps: true })
export class VehicleHistoryRequest {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  vin: string;

  @Prop({ required: true })
  provider: string;

  @Prop({ default: 'pending', index: true })
  status: 'pending' | 'success' | 'failed' | 'blocked' | 'cached';

  @Prop()
  reason?: string;

  @Prop()
  reportId?: string;

  @Prop({ default: 0 })
  riskScore: number;

  @Prop({ default: 0 })
  cost: number;

  @Prop({ index: true })
  deviceFingerprint?: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;
}

export const VehicleHistoryRequestSchema = SchemaFactory.createForClass(VehicleHistoryRequest);
VehicleHistoryRequestSchema.index({ createdAt: -1 });
VehicleHistoryRequestSchema.index({ userId: 1, createdAt: -1 });
VehicleHistoryRequestSchema.index({ deviceFingerprint: 1, createdAt: -1 });
