import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { NotificationType } from '../../shared/enums';
import { generateId } from '../../shared/utils';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

@Schema({ timestamps: true, collection: 'admin_notifications' })
export class AdminNotification extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  // Target user ID (null means for all admins)
  @Prop()
  userId?: string;

  // Target roles (e.g., ['master_admin', 'admin', 'manager'])
  @Prop({ type: [String], default: [] })
  targetRoles: string[];

  // Assigned manager ID (for manager-specific notifications)
  @Prop()
  managerId?: string;

  @Prop({ type: String, enum: Object.values(NotificationType), required: true })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  message?: string;

  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop({ type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: NotificationPriority;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: [String], default: [] })
  readByUsers: string[];

  @Prop()
  readAt?: Date;

  @Prop()
  expiresAt?: Date;

  // Additional metadata
  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const AdminNotificationSchema = SchemaFactory.createForClass(AdminNotification);
AdminNotificationSchema.index({ userId: 1, isRead: 1 });
AdminNotificationSchema.index({ targetRoles: 1, isRead: 1 });
AdminNotificationSchema.index({ managerId: 1, isRead: 1 });
AdminNotificationSchema.index({ createdAt: -1 });
AdminNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
