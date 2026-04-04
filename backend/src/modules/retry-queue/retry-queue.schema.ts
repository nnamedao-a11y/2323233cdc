/**
 * Retry Queue Schema
 * 
 * Черга для повторних спроб критичних операцій
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RetryQueueDocument = RetryQueue & Document;

export enum RetryType {
  INVOICE_SEND = 'invoice_send',
  NOTIFICATION_SEND = 'notification_send',
  WEBHOOK_DELIVERY = 'webhook_delivery',
  PROVIDER_SYNC = 'provider_sync',
  EMAIL_SEND = 'email_send',
  SMS_SEND = 'sms_send',
}

export enum RetryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABANDONED = 'abandoned',
}

@Schema({ timestamps: true, collection: 'retry_queue' })
export class RetryQueue {
  @Prop({ required: true, enum: RetryType })
  type: RetryType;

  @Prop({ required: true })
  entityId: string; // invoiceId, notificationId, etc.

  @Prop({ type: Object })
  payload: Record<string, any>;

  @Prop({ enum: RetryStatus, default: RetryStatus.PENDING })
  status: RetryStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 5 })
  maxAttempts: number;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  lastError?: string;

  @Prop()
  nextRetryAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const RetryQueueSchema = SchemaFactory.createForClass(RetryQueue);

// Indexes
RetryQueueSchema.index({ type: 1, status: 1 });
RetryQueueSchema.index({ status: 1, nextRetryAt: 1 });
RetryQueueSchema.index({ entityId: 1 });
