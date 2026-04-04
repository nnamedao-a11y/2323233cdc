/**
 * BIBI Cars - Journey Event Schema
 * Persistent storage for entity journey events
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type JourneyEventDocument = JourneyEvent & Document;

@Schema({ timestamps: true, collection: 'journey_events' })
export class JourneyEvent {
  @Prop({ required: true, index: true })
  entityType: 'lead' | 'deal' | 'shipment' | 'customer';

  @Prop({ required: true, index: true })
  entityId: string;

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop()
  stage?: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, any>;

  @Prop()
  actorType?: 'system' | 'manager' | 'team_lead' | 'owner' | 'customer' | 'provider';

  @Prop()
  actorId?: string;

  @Prop()
  source?: 'ui' | 'api' | 'webhook' | 'cron' | 'event_bus';

  @Prop()
  description?: string;
}

export const JourneyEventSchema = SchemaFactory.createForClass(JourneyEvent);

JourneyEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
JourneyEventSchema.index({ eventType: 1, createdAt: -1 });
