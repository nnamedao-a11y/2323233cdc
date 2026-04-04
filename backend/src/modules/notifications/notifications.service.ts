import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminNotification, NotificationPriority } from './notification.schema';
import { toObjectResponse, toArrayResponse, generateId } from '../../shared/utils';
import { NotificationType } from '../../shared/enums';

export interface CreateNotificationDto {
  userId?: string;
  targetRoles?: string[];
  managerId?: string;
  type: NotificationType;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  priority?: NotificationPriority;
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(AdminNotification.name) private notificationModel: Model<AdminNotification>) {}

  /**
   * Create a notification
   * - If userId is provided, it's a direct notification to a specific user
   * - If targetRoles is provided, all users with those roles will see it
   * - If managerId is provided, only that manager sees it
   */
  async create(data: CreateNotificationDto): Promise<any> {
    const notification = new this.notificationModel({
      id: generateId(),
      ...data,
      priority: data.priority || 'medium',
      targetRoles: data.targetRoles || [],
      readByUsers: [],
    });
    return toObjectResponse(await notification.save());
  }

  /**
   * Create notification for all admins (master_admin, admin)
   */
  async notifyAdmins(data: Omit<CreateNotificationDto, 'targetRoles'>): Promise<any> {
    return this.create({
      ...data,
      targetRoles: ['master_admin', 'admin'],
    });
  }

  /**
   * Create notification for a specific manager
   */
  async notifyManager(managerId: string, data: Omit<CreateNotificationDto, 'managerId'>): Promise<any> {
    return this.create({
      ...data,
      managerId,
      targetRoles: ['manager'],
    });
  }

  /**
   * Create notification visible to master_admin only
   */
  async notifyMasterAdmin(data: Omit<CreateNotificationDto, 'targetRoles'>): Promise<any> {
    return this.create({
      ...data,
      targetRoles: ['master_admin'],
    });
  }

  /**
   * Find notifications for a user based on their role and ID
   */
  async findForUser(userId: string, userRole: string, limit = 50): Promise<any[]> {
    const query: any = {
      $or: [
        { userId },
        { managerId: userId },
        { targetRoles: userRole },
      ],
    };

    // master_admin sees all notifications
    if (userRole === 'master_admin') {
      query.$or.push({ targetRoles: { $exists: true } });
    }

    const notifications = await this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    // Mark which are read by this user
    return notifications.map(n => {
      const obj = toObjectResponse(n);
      obj.isRead = n.readByUsers?.includes(userId) || n.isRead;
      return obj;
    });
  }

  /**
   * Legacy method for backward compatibility
   */
  async findByUser(userId: string, limit = 50): Promise<any[]> {
    const notifications = await this.notificationModel
      .find({ $or: [{ userId }, { managerId: userId }] })
      .sort({ createdAt: -1 })
      .limit(limit);
    return toArrayResponse(notifications);
  }

  /**
   * Mark notification as read by a specific user
   */
  async markAsRead(id: string, userId: string): Promise<any> {
    const notification = await this.notificationModel.findOneAndUpdate(
      { id },
      { 
        $set: { isRead: true, readAt: new Date() },
        $addToSet: { readByUsers: userId }
      },
      { new: true },
    );
    return notification ? toObjectResponse(notification) : null;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string, userRole: string): Promise<void> {
    const query: any = {
      $or: [
        { userId },
        { managerId: userId },
        { targetRoles: userRole },
      ],
    };

    if (userRole === 'master_admin') {
      query.$or.push({ targetRoles: { $exists: true } });
    }

    await this.notificationModel.updateMany(
      query,
      { 
        $set: { isRead: true, readAt: new Date() },
        $addToSet: { readByUsers: userId }
      }
    );
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string, userRole: string): Promise<number> {
    const query: any = {
      readByUsers: { $ne: userId },
      $or: [
        { userId },
        { managerId: userId },
        { targetRoles: userRole },
      ],
    };

    if (userRole === 'master_admin') {
      query.$or.push({ targetRoles: { $exists: true } });
    }

    return this.notificationModel.countDocuments(query);
  }

  /**
   * Delete old notifications (cleanup)
   */
  async deleteOldNotifications(daysOld = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    
    const result = await this.notificationModel.deleteMany({
      createdAt: { $lt: cutoff },
      isRead: true,
    });
    
    return result.deletedCount;
  }

  /**
   * Get notifications grouped by type for analytics
   */
  async getNotificationStats(userId: string, userRole: string): Promise<any> {
    const notifications = await this.findForUser(userId, userRole, 100);
    
    const stats = {
      total: notifications.length,
      unread: notifications.filter(n => !n.isRead).length,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
    };

    notifications.forEach(n => {
      stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
      stats.byPriority[n.priority] = (stats.byPriority[n.priority] || 0) + 1;
    });

    return stats;
  }
}
