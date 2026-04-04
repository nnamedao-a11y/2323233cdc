/**
 * Shipment Event Schema
 * 
 * Tracks all events in shipment lifecycle
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ShipmentEventSource {
  MANAGER = 'manager',
  SYSTEM = 'system',
  PROVIDER = 'provider',
}

@Schema({ timestamps: true })
export class ShipmentEvent extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  shipmentId: string;

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop()
  location?: string;

  @Prop({ required: true })
  eventDate: Date;

  @Prop({ type: String, enum: ShipmentEventSource, default: ShipmentEventSource.MANAGER })
  source: ShipmentEventSource;

  @Prop({ type: Object })
  sourceRaw?: Record<string, any>;

  @Prop()
  createdBy?: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ShipmentEventSchema = SchemaFactory.createForClass(ShipmentEvent);

// Indexes
ShipmentEventSchema.index({ id: 1 }, { unique: true });
ShipmentEventSchema.index({ shipmentId: 1 });
ShipmentEventSchema.index({ eventType: 1 });
ShipmentEventSchema.index({ eventDate: -1 });
