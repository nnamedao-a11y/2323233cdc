import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { NotificationsGateway } from './notifications.gateway';
import { TelegramNotificationService } from './telegram-notification.service';
import { Notification, NotificationDocument, NotificationStatus, NotificationSeverity } from './schemas/notification.schema';
import { NotificationRule, NotificationRuleDocument } from './schemas/notification-rule.schema';
import { NotificationDeliveryLog, NotificationDeliveryLogDocument } from './schemas/notification-delivery-log.schema';

export interface CreateNotificationInput {
  type: string;
  entityType?: string;
  entityId?: string;
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  recipientRoles?: string[];
  recipientUserIds?: string[];
  channels?: {
    inApp?: boolean;
    telegram?: boolean;
    sound?: boolean;
    email?: boolean;
  };
  soundKey?: string;
  meta?: Record<string, any>;
  eventId?: string;
}

export interface SystemEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, any>;
  timestamp: Date;
}

// Default notification rules
const DEFAULT_RULES: Record<string, Partial<NotificationRule>> = {
  'lead.created': {
    eventType: 'lead.created',
    isActive: true,
    severity: 'info' as const,
    channels: { inApp: true, telegram: true, sound: true, email: false },
    targetRoles: ['manager', 'team_lead'],
    soundKey: 'lead',
    debounceMinutes: 1,
  },
  'invoice.overdue': {
    eventType: 'invoice.overdue',
    isActive: true,
    severity: 'warning' as const,
    channels: { inApp: true, telegram: true, sound: true, email: false },
    targetRoles: ['manager', 'team_lead'],
    soundKey: 'alert',
    debounceMinutes: 30,
  },
  'invoice.created': {
    eventType: 'invoice.created',
    isActive: true,
    severity: 'info' as const,
    channels: { inApp: true, telegram: false, sound: false, email: false },
    targetRoles: ['manager'],
    soundKey: 'payment',
    debounceMinutes: 1,
  },
  'shipment.stalled': {
    eventType: 'shipment.stalled',
    isActive: true,
    severity: 'critical' as const,
    channels: { inApp: true, telegram: true, sound: true, email: false },
    targetRoles: ['manager', 'team_lead', 'owner'],
    soundKey: 'shipment',
    debounceMinutes: 60,
  },
  'shipment.no_tracking': {
    eventType: 'shipment.no_tracking',
    isActive: true,
    severity: 'warning' as const,
    channels: { inApp: true, telegram: true, sound: true, email: false },
    targetRoles: ['manager', 'team_lead'],
    soundKey: 'shipment',
    debounceMinutes: 120,
  },
  'staff.session_suspicious': {
    eventType: 'staff.session_suspicious',
    isActive: true,
    severity: 'critical' as const,
    channels: { inApp: true, telegram: true, sound: true, email: false },
    targetRoles: ['owner'],
    soundKey: 'alert',
    debounceMinutes: 10,
  },
  'payment.failed': {
    eventType: 'payment.failed',
    isActive: true,
    severity: 'warning' as const,
    channels: { inApp: true, telegram: true, sound: true, email: false },
    targetRoles: ['manager', 'team_lead'],
    soundKey: 'payment',
    debounceMinutes: 5,
  },
  'payment.received': {
    eventType: 'payment.received',
    isActive: true,
    severity: 'info' as const,
    channels: { inApp: true, telegram: true, sound: true, email: false },
    targetRoles: ['manager', 'team_lead', 'owner'],
    soundKey: 'success',
    debounceMinutes: 1,
  },
  'contract.signed': {
    eventType: 'contract.signed',
    isActive: true,
    severity: 'info' as const,
    channels: { inApp: true, telegram: true, sound: true, email: false },
    targetRoles: ['manager', 'team_lead', 'owner'],
    soundKey: 'success',
    debounceMinutes: 1,
  },
  'deal.status_changed': {
    eventType: 'deal.status_changed',
    isActive: true,
    severity: 'info' as const,
    channels: { inApp: true, telegram: false, sound: false, email: false },
    targetRoles: ['manager'],
    debounceMinutes: 1,
  },
  'manager.inactive': {
    eventType: 'manager.inactive',
    isActive: true,
    severity: 'warning' as const,
    channels: { inApp: true, telegram: true, sound: false, email: false },
    targetRoles: ['team_lead', 'owner'],
    soundKey: 'alert',
    debounceMinutes: 60,
  },
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private debounceCache = new Map<string, Date>();

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(NotificationRule.name) private ruleModel: Model<NotificationRuleDocument>,
    @InjectModel(NotificationDeliveryLog.name) private deliveryLogModel: Model<NotificationDeliveryLogDocument>,
    private readonly gateway: NotificationsGateway,
    private readonly telegramService: TelegramNotificationService,
  ) {}

  /**
   * Create notification from system event
   */
  async createFromEvent(event: SystemEvent): Promise<Notification | null> {
    this.logger.log(`Processing event: ${event.type} for ${event.aggregateType}:${event.aggregateId}`);

    const rule = await this.getRule(event.type);
    if (!rule || !rule.isActive) {
      this.logger.debug(`No active rule for event type: ${event.type}`);
      return null;
    }

    // Check debounce
    const debounceKey = `${event.type}:${event.aggregateId}`;
    if (this.isDebounced(debounceKey, rule.debounceMinutes || 10)) {
      this.logger.debug(`Event debounced: ${debounceKey}`);
      return null;
    }

    // Resolve recipients
    const recipients = await this.resolveRecipients(event, rule);

    // Create notification
    const notification = await this.createNotification({
      type: event.type,
      entityType: event.aggregateType,
      entityId: event.aggregateId,
      title: this.resolveTitle(event),
      message: this.resolveMessage(event),
      severity: rule.severity as 'info' | 'warning' | 'critical',
      recipientRoles: recipients.roles,
      recipientUserIds: recipients.userIds,
      channels: rule.channels,
      soundKey: rule.soundKey,
      meta: {
        eventId: event.id,
        link: this.resolveLink(event),
        payload: event.payload,
      },
      eventId: event.id,
    });

    // Deliver notification
    await this.deliver(notification);

    // Update debounce cache
    this.debounceCache.set(debounceKey, new Date());

    return notification;
  }

  /**
   * Create notification directly
   */
  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    const notification = new this.notificationModel({
      id: uuidv4(),
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      message: input.message,
      severity: input.severity || NotificationSeverity.INFO,
      recipientRoles: input.recipientRoles || [],
      recipientUserIds: input.recipientUserIds || [],
      channels: {
        inApp: input.channels?.inApp ?? true,
        telegram: input.channels?.telegram ?? false,
        sound: input.channels?.sound ?? false,
        email: input.channels?.email ?? false,
      },
      soundKey: input.soundKey,
      meta: input.meta || {},
      status: NotificationStatus.PENDING,
      eventId: input.eventId,
      channel: 'in_app',
    });

    await notification.save();
    this.logger.log(`Created notification: ${notification.id} (${input.type})`);

    return notification;
  }

  /**
   * Deliver notification via all configured channels
   */
  async deliver(notification: Notification): Promise<void> {
    try {
      // In-App delivery via WebSocket
      if (notification.channels.inApp) {
        await this.deliverInApp(notification);
      }

      // Telegram delivery
      if (notification.channels.telegram) {
        await this.deliverTelegram(notification);
      }

      // Sound trigger (via WebSocket)
      if (notification.channels.sound && notification.soundKey) {
        await this.triggerSound(notification);
      }

      // Update status
      await this.notificationModel.updateOne(
        { id: notification.id },
        { $set: { status: NotificationStatus.SENT, sentAt: new Date() } },
      );

      this.logger.log(`Notification delivered: ${notification.id}`);
    } catch (error: any) {
      this.logger.error(`Notification delivery failed: ${notification.id} - ${error.message}`);
      
      await this.notificationModel.updateOne(
        { id: notification.id },
        { $set: { status: NotificationStatus.FAILED, lastError: error.message } },
      );
    }
  }

  /**
   * Deliver via WebSocket (In-App)
   */
  private async deliverInApp(notification: Notification): Promise<void> {
    const payload = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      severity: notification.severity,
      soundKey: notification.soundKey,
      meta: notification.meta,
      entityType: notification.entityType,
      entityId: notification.entityId,
      createdAt: new Date().toISOString(),
    };

    // Deliver to specific users
    for (const userId of notification.recipientUserIds || []) {
      this.gateway.emitToUser(userId, payload);
      await this.logDelivery(notification.id, 'inApp', userId, 'success');
    }

    // Deliver to roles
    for (const role of notification.recipientRoles || []) {
      this.gateway.emitToRole(role, payload);
      await this.logDelivery(notification.id, 'inApp', `role:${role}`, 'success');
    }
  }

  /**
   * Deliver via Telegram
   */
  private async deliverTelegram(notification: Notification): Promise<void> {
    const targets = await this.resolveTelegramTargets(notification);

    for (const target of targets) {
      try {
        const { text, replyMarkup } = this.telegramService.formatMessageWithButtons(notification);
        
        await this.telegramService.send({
          chatId: target.chatId,
          text,
          replyMarkup,
        });

        await this.logDelivery(notification.id, 'telegram', target.chatId, 'success');
      } catch (error: any) {
        this.logger.error(`Telegram delivery failed to ${target.chatId}: ${error.message}`);
        await this.logDelivery(notification.id, 'telegram', target.chatId, 'failed', error.message);
      }
    }
  }

  /**
   * Trigger sound via WebSocket
   */
  private async triggerSound(notification: Notification): Promise<void> {
    const soundKey = notification.soundKey || 'alert';

    for (const userId of notification.recipientUserIds || []) {
      this.gateway.emitSound(userId, soundKey);
      await this.logDelivery(notification.id, 'sound', userId, 'success');
    }

    for (const role of notification.recipientRoles || []) {
      this.gateway.emitSoundToRole(role, soundKey);
      await this.logDelivery(notification.id, 'sound', `role:${role}`, 'success');
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification | null> {
    const result = await this.notificationModel.findOneAndUpdate(
      { id: notificationId, recipientUserIds: userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true },
    );

    return result;
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationModel.updateMany(
      { recipientUserIds: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );

    return result.modifiedCount;
  }

  /**
   * Get notifications for user
   */
  async getMyNotifications(userId: string, options?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const query: any = {
      $or: [
        { recipientUserIds: userId },
        { userId },
      ],
    };

    if (options?.unreadOnly) {
      query.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(options?.offset || 0)
        .limit(options?.limit || 50)
        .exec(),
      this.notificationModel.countDocuments(query),
      this.notificationModel.countDocuments({ ...query, isRead: false }),
    ]);

    return { notifications, total, unreadCount };
  }

  /**
   * Get notification rules
   */
  async getRules(): Promise<NotificationRule[]> {
    const rules = await this.ruleModel.find().exec();
    
    // Merge with defaults
    const allEventTypes = new Set([
      ...Object.keys(DEFAULT_RULES),
      ...rules.map(r => r.eventType),
    ]);

    const result: NotificationRule[] = [];
    
    for (const eventType of allEventTypes) {
      const dbRule = rules.find(r => r.eventType === eventType);
      if (dbRule) {
        result.push(dbRule);
      } else if (DEFAULT_RULES[eventType]) {
        result.push(DEFAULT_RULES[eventType] as NotificationRule);
      }
    }

    return result;
  }

  /**
   * Update notification rule
   */
  async updateRule(eventType: string, updates: Partial<NotificationRule>): Promise<NotificationRule> {
    const rule = await this.ruleModel.findOneAndUpdate(
      { eventType },
      { $set: { ...updates, eventType } },
      { new: true, upsert: true },
    );

    return rule;
  }

  // ===== Helper Methods =====

  private async getRule(eventType: string): Promise<NotificationRule | null> {
    // Check database first
    const dbRule = await this.ruleModel.findOne({ eventType }).exec();
    if (dbRule) {
      return dbRule;
    }

    // Fall back to defaults
    return (DEFAULT_RULES[eventType] as NotificationRule) || null;
  }

  private isDebounced(key: string, debounceMinutes: number): boolean {
    const lastNotified = this.debounceCache.get(key);
    if (!lastNotified) return false;

    const elapsed = (Date.now() - lastNotified.getTime()) / 1000 / 60;
    return elapsed < debounceMinutes;
  }

  private async resolveRecipients(event: SystemEvent, rule: NotificationRule): Promise<{
    roles: string[];
    userIds: string[];
  }> {
    const roles = rule.targetRoles || [];
    const userIds: string[] = [];

    // Add manager from event payload if available
    if (event.payload?.managerId) {
      userIds.push(event.payload.managerId);
    }

    // Add team lead if escalation needed
    if (event.payload?.teamLeadId && rule.severity === 'warning') {
      userIds.push(event.payload.teamLeadId);
    }

    return { roles, userIds };
  }

  private resolveTitle(event: SystemEvent): string {
    const titles: Record<string, string> = {
      'lead.created': '🔥 Новий лід',
      'invoice.overdue': '💳 Прострочена оплата',
      'invoice.created': '📄 Новий рахунок',
      'shipment.stalled': '🚢 Доставка зупинилась',
      'shipment.no_tracking': '📦 Немає трекінгу',
      'contract.signed': '✅ Контракт підписано',
      'payment.failed': '❌ Помилка оплати',
      'payment.received': '💰 Оплату отримано',
      'manager.inactive': '⚠️ Менеджер неактивний',
      'staff.session_suspicious': '🔐 Підозріла сесія',
      'deal.status_changed': '📊 Статус угоди змінено',
    };

    return titles[event.type] || 'Сповіщення';
  }

  private resolveMessage(event: SystemEvent): string {
    switch (event.type) {
      case 'lead.created':
        return `Новий лід ${event.payload?.name || ''}${event.payload?.country ? ` з ${event.payload.country}` : ''}`;
      case 'invoice.overdue':
        return `Рахунок прострочено${event.payload?.amount ? `: $${event.payload.amount}` : ''}`;
      case 'invoice.created':
        return `Створено рахунок${event.payload?.amount ? ` на $${event.payload.amount}` : ''}`;
      case 'shipment.stalled':
        return `Доставка без оновлень ${event.payload?.days || ''} днів`;
      case 'shipment.no_tracking':
        return `Контейнер ${event.payload?.container || ''} без трекінгу`;
      case 'contract.signed':
        return `Клієнт ${event.payload?.customerName || ''} підписав контракт`;
      case 'payment.failed':
        return `Помилка оплати: ${event.payload?.error || 'Невідома помилка'}`;
      case 'payment.received':
        return `Отримано оплату${event.payload?.amount ? `: $${event.payload.amount}` : ''}${event.payload?.customerName ? ` від ${event.payload.customerName}` : ''}`;
      case 'manager.inactive':
        return `Менеджер ${event.payload?.managerName || ''} неактивний ${event.payload?.hours || ''} годин`;
      case 'staff.session_suspicious':
        return `Підозріла активність сесії: ${event.payload?.reason || ''}`;
      case 'deal.status_changed':
        return `Угода змінила статус: ${event.payload?.oldStatus} → ${event.payload?.newStatus}`;
      default:
        return event.type;
    }
  }

  private resolveLink(event: SystemEvent): string {
    const links: Record<string, string> = {
      lead: '/manager/leads',
      deal: '/manager/deals',
      shipment: '/manager/shipping',
      invoice: '/manager/invoices',
      contract: '/manager/deals',
      session: '/admin/staff-sessions',
    };

    const basePath = links[event.aggregateType] || '/';
    return event.aggregateId ? `${basePath}/${event.aggregateId}` : basePath;
  }

  private async resolveTelegramTargets(notification: Notification): Promise<{ chatId: string; userId?: string }[]> {
    // TODO: Query users with linked Telegram accounts by roles/userIds
    // For now, return empty - will be configured per-user
    return [];
  }

  private async logDelivery(
    notificationId: string,
    channel: 'inApp' | 'telegram' | 'email' | 'sound',
    target: string,
    status: 'success' | 'failed' | 'skipped',
    error?: string,
  ): Promise<void> {
    try {
      await this.deliveryLogModel.create({
        notificationId,
        channel,
        target,
        status,
        error,
        deliveredAt: new Date(),
      });
    } catch (e) {
      this.logger.error(`Failed to log delivery: ${e}`);
    }
  }
}
