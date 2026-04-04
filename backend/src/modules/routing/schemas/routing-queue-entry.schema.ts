/**
 * BIBI Cars - Routing Queue Entry Schema
 * For leads that couldn't be auto-assigned
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RoutingQueueEntryDocument = RoutingQueueEntry & Document;

@Schema({ timestamps: true })
export class RoutingQueueEntry {
  @Prop({ required: true, index: true })
  leadId: string;

  @Prop({ default: 'default_queue' })
  queueName: string;

  @Prop({ default: 'pending', index: true, enum: ['pending', 'assigned', 'expired'] })
  status: string;

  @Prop()
  reason?: string;

  @Prop()
  assignedAt?: Date;

  @Prop()
  assignedTo?: string;

  @Prop()
  expiredAt?: Date;
}

export const RoutingQueueEntrySchema = SchemaFactory.createForClass(RoutingQueueEntry);

RoutingQueueEntrySchema.index({ status: 1, createdAt: 1 });
RoutingQueueEntrySchema.index({ queueName: 1, status: 1 });
