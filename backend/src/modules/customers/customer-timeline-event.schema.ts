import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Customer Timeline Event Schema
 * 
 * Зберігає всі події клієнта:
 * - lead_created, quote_created, deal_created
 * - deal_status_changed, deposit_created
 * - call_logged, message_sent, note_added
 */

export type CustomerTimelineEventDocument = CustomerTimelineEvent & Document;

@Schema({ timestamps: true })
export class CustomerTimelineEvent {
  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ required: true, enum: [
    'lead_created',
    'quote_created',
    'quote_updated',
    'deal_created',
    'deal_status_changed',
    'deal_completed',
    'deposit_created',
    'deposit_confirmed',
    'call_logged',
    'message_sent',
    'note_added',
    'customer_created',
    'customer_updated'
  ]})
  type: string;

  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop({ enum: ['lead', 'quote', 'deal', 'deposit', 'task', 'activity', 'customer'] })
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop()
  managerId?: string;

  @Prop({ type: Object, default: {} })
  meta?: Record<string, any>;
}

export const CustomerTimelineEventSchema = SchemaFactory.createForClass(CustomerTimelineEvent);

CustomerTimelineEventSchema.index({ customerId: 1, createdAt: -1 });
