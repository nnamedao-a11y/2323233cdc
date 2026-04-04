/**
 * BIBI Cars - System Event Schema (MongoDB)
 * Stores all domain events for audit, analytics, journey tracking
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ 
  timestamps: true,
  collection: 'system_events',
})
export class SystemEventDocument extends Document {
  @Prop({ required: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  type: string;

  @Prop({ index: true })
  aggregateType: string;

  @Prop({ index: true })
  aggregateId: string;

  @Prop({ type: Object })
  payload: Record<string, any>;

  @Prop()
  actorType: string;

  @Prop({ index: true })
  actorId: string;

  @Prop()
  source: string;

  @Prop({ type: Date, default: Date.now, index: true })
  eventDate: Date;
}

export const SystemEventSchema = SchemaFactory.createForClass(SystemEventDocument);

// Indexes for efficient querying
SystemEventSchema.index({ type: 1, createdAt: -1 });
SystemEventSchema.index({ aggregateType: 1, aggregateId: 1, createdAt: -1 });
SystemEventSchema.index({ actorId: 1, createdAt: -1 });
