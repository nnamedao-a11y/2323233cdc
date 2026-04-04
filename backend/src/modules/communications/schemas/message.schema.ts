import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CommunicationChannel } from '../../../shared/enums';
import { generateId } from '../../../shared/utils';

/**
 * Message Schema - Повна модель повідомлення з delivery tracking
 * Production-ready для Twilio webhook integration
 */

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'pending';
export type MessageDirection = 'outbound' | 'inbound';
export type MessageProvider = 'twilio' | 'resend' | 'viber' | 'internal';

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  // Зв'язки
  @Prop({ index: true })
  customerId?: string;

  @Prop({ index: true })
  leadId?: string;

  @Prop()
  dealId?: string;

  // Канал та провайдер
  @Prop({ type: String, enum: Object.values(CommunicationChannel), required: true, index: true })
  channel: CommunicationChannel;

  @Prop({ type: String, enum: ['twilio', 'resend', 'viber', 'internal'], required: true })
  provider: MessageProvider;

  @Prop({ type: String, enum: ['outbound', 'inbound'], default: 'outbound' })
  direction: MessageDirection;

  // Контакт
  @Prop({ required: true })
  to: string;

  @Prop()
  from?: string;

  // Контент
  @Prop({ required: true })
  content: string;

  @Prop()
  subject?: string;

  @Prop()
  templateId?: string;

  // Provider metadata
  @Prop({ index: true })
  providerMessageId?: string; // MessageSid для Twilio

  @Prop({ type: Object })
  providerPayload?: Record<string, any>;

  // Статус доставки
  @Prop({ 
    type: String, 
    enum: ['queued', 'sent', 'delivered', 'undelivered', 'failed', 'pending'],
    default: 'pending',
    index: true 
  })
  status: MessageStatus;

  // Помилка
  @Prop()
  errorCode?: string;

  @Prop()
  errorMessage?: string;

  // Retry tracking
  @Prop({ default: 0 })
  retryCount: number;

  @Prop({ default: 3 })
  maxRetries: number;

  @Prop()
  nextRetryAt?: Date;

  // Timestamps
  @Prop()
  queuedAt?: Date;

  @Prop()
  sentAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  failedAt?: Date;

  // Meta
  @Prop()
  sentBy?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Індекси для ефективного пошуку
MessageSchema.index({ providerMessageId: 1 });
MessageSchema.index({ customerId: 1, createdAt: -1 });
MessageSchema.index({ leadId: 1, createdAt: -1 });
MessageSchema.index({ status: 1, channel: 1 });
MessageSchema.index({ nextRetryAt: 1, status: 1 });
