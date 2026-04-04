import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../../shared/utils';

/**
 * Communication Event Schema - Timeline подій комунікацій
 * Для відображення повної історії взаємодії з клієнтом
 */

export type CommunicationEventType = 
  | 'call_attempt'
  | 'call_completed' 
  | 'call_missed'
  | 'sms_sent'
  | 'sms_delivered'
  | 'sms_failed'
  | 'sms_undelivered'
  | 'email_sent'
  | 'email_delivered'
  | 'email_opened'
  | 'email_bounced'
  | 'viber_sent'
  | 'viber_delivered'
  | 'callback_scheduled'
  | 'callback_completed'
  | 'followup_scheduled'
  | 'status_changed'
  | 'escalation';

@Schema({ timestamps: true })
export class CommunicationEvent extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  // Зв'язки
  @Prop({ required: true, index: true })
  customerId: string;

  @Prop({ index: true })
  leadId?: string;

  // Тип події
  @Prop({ 
    type: String, 
    enum: [
      'call_attempt', 'call_completed', 'call_missed',
      'sms_sent', 'sms_delivered', 'sms_failed', 'sms_undelivered',
      'email_sent', 'email_delivered', 'email_opened', 'email_bounced',
      'viber_sent', 'viber_delivered',
      'callback_scheduled', 'callback_completed',
      'followup_scheduled', 'status_changed', 'escalation'
    ],
    required: true,
    index: true
  })
  type: CommunicationEventType;

  // Канал
  @Prop({ type: String, enum: ['call', 'sms', 'email', 'viber', 'system'] })
  channel: string;

  // Зв'язок з повідомленням
  @Prop()
  messageId?: string;

  // Деталі
  @Prop()
  title: string;

  @Prop()
  description?: string;

  // Додаткові дані
  @Prop({ type: Object })
  meta?: {
    phone?: string;
    email?: string;
    duration?: number;
    result?: string;
    errorCode?: string;
    automationRuleId?: string;
    previousStatus?: string;
    newStatus?: string;
    escalationLevel?: number;
  };

  // Хто ініціював
  @Prop()
  initiatedBy?: string; // userId або 'system'

  @Prop({ default: false })
  isAutomated: boolean;
}

export const CommunicationEventSchema = SchemaFactory.createForClass(CommunicationEvent);

// Індекси
CommunicationEventSchema.index({ customerId: 1, createdAt: -1 });
CommunicationEventSchema.index({ leadId: 1, createdAt: -1 });
CommunicationEventSchema.index({ type: 1, createdAt: -1 });
