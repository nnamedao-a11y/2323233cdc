/**
 * Notification Delivery Schema
 * 
 * Tracks delivery of notifications across channels
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDeliveryDocument = NotificationDelivery & Document;

@Schema({ timestamps: true })
export class NotificationDelivery {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  notificationType: string;

  @Prop({ required: true, enum: ['telegram', 'viber', 'email'] })
  channel: string;

  @Prop({ required: true, enum: ['sent', 'failed', 'pending'] })
  status: string;

  @Prop()
  error?: string;

  @Prop({ default: 5 })
  priority: number;

  @Prop({ required: true })
  timestamp: Date;

  @Prop({ type: Object })
  meta?: any;
}

export const NotificationDeliverySchema = SchemaFactory.createForClass(NotificationDelivery);

// Indexes
NotificationDeliverySchema.index({ userId: 1, timestamp: -1 });
NotificationDeliverySchema.index({ channel: 1, status: 1 });
NotificationDeliverySchema.index({ timestamp: -1 });
