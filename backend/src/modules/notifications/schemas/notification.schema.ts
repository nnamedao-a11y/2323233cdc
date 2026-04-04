import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationChannel {
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  PUSH = 'push',
  IN_APP = 'in_app',
}

export enum NotificationType {
  // User Notifications
  AUCTION_SOON = 'auction_soon',
  PRICE_DROP = 'price_drop',
  LISTING_SOLD = 'listing_sold',
  RECOMMENDATION = 'recommendation',
  SAVED_CAR_UPDATE = 'saved_car_update',
  
  // CRM Event Notifications
  NEW_LEAD = 'new_lead',
  LEAD_CREATED = 'lead.created',
  DEAL_STATUS_CHANGED = 'deal_status_changed',
  WAITING_DEPOSIT_TIMEOUT = 'waiting_deposit_timeout',
  DEAL_COMPLETED = 'deal_completed',
  INVOICE_OVERDUE = 'invoice.overdue',
  SHIPMENT_STALLED = 'shipment.stalled',
  SHIPMENT_NO_TRACKING = 'shipment.no_tracking',
  CONTRACT_SIGNED = 'contract.signed',
  PAYMENT_FAILED = 'payment.failed',
  MANAGER_INACTIVE = 'manager.inactive',
  SESSION_SUSPICIOUS = 'staff.session_suspicious',
  
  // System
  WELCOME = 'welcome',
  ACCOUNT_LINKED = 'account_linked',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Notification Schema
 * 
 * Stores all notifications with delivery status and multi-channel support
 */

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ index: true })
  userId?: string;

  @Prop({ index: true })
  customerId?: string;

  @Prop({ index: true })
  managerId?: string;

  @Prop({ required: true, index: true })
  type: string;

  @Prop({ index: true })
  entityType?: string;

  @Prop({ index: true })
  entityId?: string;

  @Prop({ required: true, enum: NotificationChannel })
  channel: NotificationChannel;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ enum: NotificationSeverity, default: NotificationSeverity.INFO })
  severity: NotificationSeverity;

  @Prop({ type: [String], default: [] })
  recipientRoles: string[];

  @Prop({ type: [String], default: [], index: true })
  recipientUserIds: string[];

  @Prop({ 
    type: Object, 
    default: { inApp: true, telegram: false, sound: false, email: false } 
  })
  channels: {
    inApp: boolean;
    telegram: boolean;
    sound: boolean;
    email: boolean;
  };

  @Prop({ enum: NotificationStatus, default: NotificationStatus.PENDING, index: true })
  status: NotificationStatus;

  @Prop()
  sentAt?: Date;

  @Prop()
  error?: string;

  @Prop({ type: Object })
  meta?: {
    listingId?: string;
    listingTitle?: string;
    dealId?: string;
    leadId?: string;
    oldPrice?: number;
    newPrice?: number;
    auctionDate?: Date;
    link?: string;
    eventId?: string;
    payload?: any;
  };

  @Prop({ default: 0 })
  priority: number;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  readAt?: Date;

  @Prop()
  soundKey?: string;

  @Prop()
  lastError?: string;

  @Prop()
  eventId?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ status: 1, createdAt: 1 });
NotificationSchema.index({ customerId: 1, isRead: 1 });
NotificationSchema.index({ recipientUserIds: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ type: 1, entityId: 1, createdAt: -1 });
NotificationSchema.index({ recipientRoles: 1, createdAt: -1 });
