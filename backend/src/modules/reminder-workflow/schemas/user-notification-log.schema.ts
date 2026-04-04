/**
 * User Notification Log Schema
 * 
 * Логування надісланих нотифікацій (щоб не спамити)
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserNotificationLogDocument = UserNotificationLog & Document;

export enum NotificationType {
  AUCTION_SOON = 'auction_soon',       // Аукціон через <24h
  PRICE_CHANGED = 'price_changed',     // Ціна змінилась
  AUCTION_MISSED = 'auction_missed',   // Аукціон пройшов
  IDLE_USER = 'idle_user',             // Користувач пропав >24h
  FAVORITE_REMINDER = 'favorite_reminder',
  COMPARE_REMINDER = 'compare_reminder',
}

export enum NotificationChannel {
  EMAIL = 'email',
  TELEGRAM = 'telegram',
  VIBER = 'viber',
  PUSH = 'push',
  SMS = 'sms',
}

@Schema({ timestamps: true })
export class UserNotificationLog {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  vin: string;

  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({ required: true, enum: NotificationChannel })
  channel: NotificationChannel;

  @Prop()
  vehicleId?: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;

  @Prop({ default: false })
  delivered: boolean;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  error?: string;
}

export const UserNotificationLogSchema = SchemaFactory.createForClass(UserNotificationLog);
UserNotificationLogSchema.index({ userId: 1, vin: 1, type: 1, createdAt: -1 });
UserNotificationLogSchema.index({ createdAt: -1 });
