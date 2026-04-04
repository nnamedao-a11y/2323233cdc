import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnalyticsEventDocument = AnalyticsEvent & Document;

/**
 * Analytics Event Schema
 * 
 * Stores all tracking events
 */
@Schema({ timestamps: true, collection: 'analytics_events' })
export class AnalyticsEvent {
  @Prop({ required: true, index: true })
  event: string; // page_view, vin_search, quote_created, etc.

  @Prop({ index: true })
  sessionId: string;

  @Prop({ index: true })
  customerId?: string;

  @Prop()
  url: string;

  @Prop()
  referrer?: string;

  @Prop()
  userAgent?: string;

  @Prop({ type: Object })
  utm?: {
    source?: string;
    campaign?: string;
    medium?: string;
    content?: string;
    term?: string;
  };

  @Prop({ type: Object })
  data?: Record<string, any>;

  @Prop()
  duration?: number;

  @Prop({ default: false })
  hasInteraction: boolean;

  @Prop()
  ip?: string;

  @Prop({ default: false })
  isFake: boolean;
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEvent);

// Indexes for fast queries
AnalyticsEventSchema.index({ event: 1, createdAt: -1 });
AnalyticsEventSchema.index({ sessionId: 1, createdAt: -1 });
AnalyticsEventSchema.index({ 'utm.source': 1, createdAt: -1 });
AnalyticsEventSchema.index({ customerId: 1, event: 1 });
AnalyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // 90 days TTL
