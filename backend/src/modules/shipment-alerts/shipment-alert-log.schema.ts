/**
 * Shipment Alert Log Schema
 * 
 * Tracks sent alerts for shipments
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ShipmentAlertType {
  STALLED = 'stalled',
  DELAYED = 'delayed',
  ETA_CHANGED = 'eta_changed',
  CUSTOMS_HOLD = 'customs_hold',
}

@Schema({ timestamps: true })
export class ShipmentAlertLog extends Document {
  @Prop({ required: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  shipmentId: string;

  @Prop({ required: true, index: true })
  dealId: string;

  @Prop({ type: String, enum: ShipmentAlertType, required: true, index: true })
  alertType: ShipmentAlertType;

  @Prop({ default: false })
  sentToUser: boolean;

  @Prop({ default: false })
  sentToManager: boolean;

  @Prop({ default: false })
  sentToTeamLead: boolean;

  @Prop({ default: false })
  sentToOwner: boolean;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  createdAt: Date;
}

export const ShipmentAlertLogSchema = SchemaFactory.createForClass(ShipmentAlertLog);

ShipmentAlertLogSchema.index({ shipmentId: 1, alertType: 1 });
ShipmentAlertLogSchema.index({ createdAt: -1 });
