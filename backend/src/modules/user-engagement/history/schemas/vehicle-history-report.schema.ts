/**
 * Vehicle History Report Schema
 * 
 * Кешовані history reports
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VehicleHistoryReportDocument = VehicleHistoryReport & Document;

@Schema({ timestamps: true })
export class VehicleHistoryReport {
  @Prop({ required: true, index: true })
  vin: string;

  @Prop({ required: true })
  provider: string;

  @Prop({ type: Object, default: {} })
  rawData: Record<string, any>;

  @Prop({ type: Object, default: {} })
  normalizedData: Record<string, any>;

  @Prop()
  fetchedByUserId?: string;

  @Prop({ index: true })
  expiresAt?: Date;

  @Prop({ default: 0 })
  viewCount: number;
}

export const VehicleHistoryReportSchema = SchemaFactory.createForClass(VehicleHistoryReport);
VehicleHistoryReportSchema.index({ vin: 1, provider: 1 });
VehicleHistoryReportSchema.index({ expiresAt: 1 });
