/**
 * Alerts Service
 * 
 * Central alert system for BIBI Cars CRM
 * Handles Telegram notifications, email alerts, and event logging
 * 
 * Priority:
 * - CRITICAL: Immediate attention (suspicious login, payment issues)
 * - HIGH: Important (new hot lead, invoice paid)
 * - MEDIUM: Regular updates (carfax uploaded, shipment update)
 * - LOW: Info (daily summaries)
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TelegramBotService } from '../telegram-bot/telegram-bot.service';
import { AlertEvent, AlertEventType, AlertPriority, AlertChannel } from './alert-event.schema';
import { AlertSettings } from './alert-settings.schema';
import { generateId } from '../../shared/utils';

interface AlertPayload {
  eventType: AlertEventType;
  priority?: AlertPriority;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  customTitle?: string;
  customMessage?: string;
}

// Event templates
const EVENT_TEMPLATES: Record<AlertEventType, { title: string; template: string; priority: AlertPriority }> = {
  // Security
  [AlertEventType.MANAGER_LOGIN]: {
    title: '👤 Вхід менеджера',
    template: 'Менеджер {{managerName}} увійшов в систему\nIP: {{ip}}\nПристрій: {{device}}\nЧас: {{time}}',
    priority: AlertPriority.MEDIUM,
  },
  [AlertEventType.MANAGER_LOGIN_SUSPICIOUS]: {
    title: '🚨 Підозрілий вхід',
    template: 'Підозрілий вхід виявлено!\nКористувач: {{userName}}\nIP: {{ip}} (новий)\nПристрій: {{device}}\nРекомендація: перевірте сесії',
    priority: AlertPriority.CRITICAL,
  },
  [AlertEventType.TEAMLEAD_LOGIN_REQUEST]: {
    title: '🔐 Запит на вхід Team Lead',
    template: 'Team Lead {{userName}} запитує дозвіл на вхід\nEmail: {{email}}\nНатисніть для підтвердження',
    priority: AlertPriority.HIGH,
  },
  [AlertEventType.TEAMLEAD_LOGIN_APPROVED]: {
    title: '✅ Вхід підтверджено',
    template: 'Team Lead {{userName}} отримав дозвіл на вхід',
    priority: AlertPriority.MEDIUM,
  },
  [AlertEventType.SESSION_TERMINATED]: {
    title: '🔴 Сесію завершено',
    template: 'Сесію користувача {{userName}} примусово завершено',
    priority: AlertPriority.HIGH,
  },
  [AlertEventType.NEW_DEVICE_DETECTED]: {
    title: '📱 Новий пристрій',
    template: 'Новий пристрій виявлено для {{userName}}\nПристрій: {{device}}\nIP: {{ip}}',
    priority: AlertPriority.HIGH,
  },
  
  // Leads
  [AlertEventType.LEAD_CREATED]: {
    title: '🆕 Новий лід',
    template: 'Новий лід створено\nІмя: {{customerName}}\nТелефон: {{phone}}\nДжерело: {{source}}',
    priority: AlertPriority.MEDIUM,
  },
  [AlertEventType.HOT_LEAD_CREATED]: {
    title: '🔥 ГАРЯЧИЙ ЛІД',
    template: 'Гарячий лід потребує негайної уваги!\nІмя: {{customerName}}\nТелефон: {{phone}}\nVIN: {{vin}}\nМенеджер: {{managerName}}',
    priority: AlertPriority.CRITICAL,
  },
  [AlertEventType.HOT_LEAD_MISSED]: {
    title: '⚠️ Пропущений гарячий лід',
    template: 'Гарячий лід не оброблено!\nІмя: {{customerName}}\nВже чекає: {{waitTime}}\nМенеджер: {{managerName}}',
    priority: AlertPriority.CRITICAL,
  },
  
  // Calls
  [AlertEventType.CALL_NO_ANSWER]: {
    title: '📞 Немає відповіді (3x)',
    template: 'Клієнт не відповів 3 рази\nІмя: {{customerName}}\nТелефон: {{phone}}\nРекомендація: надіслати SMS',
    priority: AlertPriority.HIGH,
  },
  [AlertEventType.CALL_CALLBACK_DUE]: {
    title: '⏰ Час передзвону',
    template: 'Заплановано передзвін\nКлієнт: {{customerName}}\nЧас: {{scheduledTime}}',
    priority: AlertPriority.MEDIUM,
  },
  
  // Carfax
  [AlertEventType.CARFAX_REQUESTED]: {
    title: '📋 Запит Carfax',
    template: 'Новий запит на Carfax\nVIN: {{vin}}\nКлієнт: {{customerName}}',
    priority: AlertPriority.LOW,
  },
  [AlertEventType.CARFAX_UPLOADED]: {
    title: '✅ Carfax завантажено',
    template: 'Carfax звіт готовий\nVIN: {{vin}}\nКлієнт: {{customerName}}\nМенеджер: {{managerName}}',
    priority: AlertPriority.MEDIUM,
  },
  [AlertEventType.CARFAX_ABUSE_DETECTED]: {
    title: '🚫 Зловживання Carfax',
    template: 'Виявлено зловживання Carfax!\nКористувач: {{userName}}\nЗапитів за тиждень: {{requestCount}}\nБез конверсії в угоду',
    priority: AlertPriority.HIGH,
  },
  
  // Payments
  [AlertEventType.INVOICE_CREATED]: {
    title: '📄 Новий рахунок',
    template: 'Створено рахунок\nКлієнт: {{customerName}}\nСума: ${{amount}}\nТип: {{invoiceType}}',
    priority: AlertPriority.LOW,
  },
  [AlertEventType.INVOICE_PAID]: {
    title: '💰 ОПЛАТА ОТРИМАНА',
    template: 'Оплата успішно отримана!\nКлієнт: {{customerName}}\nСума: ${{amount}}\nАвто: {{vehicleTitle}}',
    priority: AlertPriority.CRITICAL,
  },
  [AlertEventType.INVOICE_OVERDUE]: {
    title: '⚠️ Прострочений рахунок',
    template: 'Рахунок прострочено!\nКлієнт: {{customerName}}\nСума: ${{amount}}\nПрострочено: {{overdueDays}} днів',
    priority: AlertPriority.HIGH,
  },
  
  // Contracts
  [AlertEventType.CONTRACT_SIGNED]: {
    title: '✍️ Контракт підписано',
    template: 'Контракт успішно підписано!\nКлієнт: {{customerName}}\nАвто: {{vehicleTitle}}\nСума: ${{amount}}',
    priority: AlertPriority.HIGH,
  },
  [AlertEventType.CONTRACT_FAILED]: {
    title: '❌ Контракт відхилено',
    template: 'Контракт відхилено клієнтом\nКлієнт: {{customerName}}\nПричина: {{reason}}',
    priority: AlertPriority.HIGH,
  },
  
  // Shipping
  [AlertEventType.SHIPMENT_UPDATED]: {
    title: '🚢 Оновлення доставки',
    template: 'Статус доставки змінено\nVIN: {{vin}}\nНовий статус: {{status}}\nМісце: {{location}}',
    priority: AlertPriority.MEDIUM,
  },
  [AlertEventType.SHIPMENT_DELAYED]: {
    title: '⏳ Затримка доставки',
    template: 'Доставка затримується!\nVIN: {{vin}}\nКлієнт: {{customerName}}\nНовий ETA: {{newEta}}',
    priority: AlertPriority.HIGH,
  },
  [AlertEventType.SHIPMENT_ARRIVED]: {
    title: '🎉 Авто прибуло',
    template: 'Автомобіль прибув!\nVIN: {{vin}}\nКлієнт: {{customerName}}\nПорт: {{port}}',
    priority: AlertPriority.HIGH,
  },
  [AlertEventType.SHIPMENT_STATUS_CHANGED]: {
    title: '📦 Статус доставки змінено',
    template: 'Статус змінено: {{oldStatus}} → {{newStatus}}\nVIN: {{vin}}\nShipment ID: {{shipmentId}}',
    priority: AlertPriority.MEDIUM,
  },
  [AlertEventType.SHIPMENT_ETA_CHANGED]: {
    title: '📅 ETA змінено',
    template: 'Дата прибуття змінилась\nVIN: {{vin}}\nСтарий ETA: {{oldEta}}\nНовий ETA: {{newEta}}',
    priority: AlertPriority.MEDIUM,
  },
  [AlertEventType.SHIPMENT_SYNC_FAILED]: {
    title: '❌ Помилка синхронізації',
    template: 'Не вдалось оновити трекінг!\nVIN: {{vin}}\nПомилка: {{error}}',
    priority: AlertPriority.HIGH,
  },
  [AlertEventType.SHIPMENT_STALLED]: {
    title: '🚨 Shipment завис',
    template: 'Shipment не оновлювався 24+ годин!\nVIN: {{vin}}\nОстання синхронізація: {{lastSyncAt}}',
    priority: AlertPriority.HIGH,
  },
  
  // KPI
  [AlertEventType.MANAGER_KPI_CRITICAL]: {
    title: '📉 Критичний KPI',
    template: 'Менеджер {{managerName}} має критичні показники\nДзвінків: {{callsCount}}\nКонверсія: {{conversionRate}}%',
    priority: AlertPriority.HIGH,
  },
  [AlertEventType.MANAGER_PERFORMANCE_LOW]: {
    title: '⚠️ Низька продуктивність',
    template: 'Менеджер {{managerName}} показує низьку активність\nАктивних завдань: {{activeTasks}}\nОстання дія: {{lastActivity}}',
    priority: AlertPriority.MEDIUM,
  },
  
  // Tasks
  [AlertEventType.TASK_OVERDUE]: {
    title: '⏰ Прострочене завдання',
    template: 'Завдання прострочено!\nЗавдання: {{taskTitle}}\nМенеджер: {{managerName}}\nПрострочено: {{overdueDays}} днів',
    priority: AlertPriority.HIGH,
  },
};

// Role-based event subscriptions
const ROLE_SUBSCRIPTIONS: Record<string, AlertEventType[]> = {
  owner: Object.values(AlertEventType), // Owner receives all
  team_lead: [
    AlertEventType.MANAGER_LOGIN,
    AlertEventType.MANAGER_LOGIN_SUSPICIOUS,
    AlertEventType.HOT_LEAD_CREATED,
    AlertEventType.HOT_LEAD_MISSED,
    AlertEventType.CALL_NO_ANSWER,
    AlertEventType.CARFAX_UPLOADED,
    AlertEventType.INVOICE_PAID,
    AlertEventType.CONTRACT_SIGNED,
    AlertEventType.MANAGER_KPI_CRITICAL,
    AlertEventType.MANAGER_PERFORMANCE_LOW,
    AlertEventType.TASK_OVERDUE,
  ],
  manager: [
    AlertEventType.CALL_CALLBACK_DUE,
    AlertEventType.TASK_OVERDUE,
  ],
};

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectModel(AlertEvent.name) private alertEventModel: Model<AlertEvent>,
    @InjectModel(AlertSettings.name) private alertSettingsModel: Model<AlertSettings>,
    @InjectModel('User') private userModel: Model<any>,
    private telegramService: TelegramBotService,
  ) {}

  /**
   * Send an alert based on event type
   * Automatically determines recipients and channels
   */
  async sendAlert(payload: AlertPayload): Promise<void> {
    const { eventType, metadata = {} } = payload;
    
    const template = EVENT_TEMPLATES[eventType];
    if (!template) {
      this.logger.warn(`No template for event type: ${eventType}`);
      return;
    }

    const priority = payload.priority || template.priority;
    const title = payload.customTitle || template.title;
    const message = payload.customMessage || this.renderTemplate(template.template, metadata);

    // Find recipients based on event type and roles
    const recipients = await this.findRecipients(eventType, metadata.teamId);

    for (const recipient of recipients) {
      await this.sendToRecipient(recipient, {
        eventType,
        priority,
        title,
        message,
        entityType: payload.entityType,
        entityId: payload.entityId,
        metadata,
      });
    }
  }

  /**
   * Send alert to specific recipient
   */
  private async sendToRecipient(
    recipient: { userId: string; role: string; telegramChatId?: string; email?: string },
    alert: {
      eventType: AlertEventType;
      priority: AlertPriority;
      title: string;
      message: string;
      entityType?: string;
      entityId?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    // Check if recipient should receive this alert
    const settings = await this.alertSettingsModel.findOne({ userId: recipient.userId });
    
    if (settings) {
      // Check priority filter
      if (alert.priority === AlertPriority.LOW && !settings.receiveLow) return;
      if (alert.priority === AlertPriority.MEDIUM && !settings.receiveMedium) return;
      if (alert.priority === AlertPriority.HIGH && !settings.receiveHigh) return;
      if (alert.priority === AlertPriority.CRITICAL && !settings.receiveCritical) return;
      
      // Check disabled events
      if (settings.disabledEvents?.includes(alert.eventType)) return;
    }

    // Create alert event record
    const alertEvent = new this.alertEventModel({
      id: generateId(),
      eventType: alert.eventType,
      priority: alert.priority,
      recipientId: recipient.userId,
      recipientRole: recipient.role,
      telegramChatId: recipient.telegramChatId || settings?.telegramChatId,
      title: alert.title,
      message: alert.message,
      entityType: alert.entityType,
      entityId: alert.entityId,
      metadata: alert.metadata,
      channel: AlertChannel.TELEGRAM,
      sent: false,
    });

    // Send via Telegram
    const chatId = recipient.telegramChatId || settings?.telegramChatId;
    if (chatId && (settings?.telegramEnabled !== false)) {
      try {
        const fullMessage = `${alert.title}\n\n${alert.message}`;
        await this.telegramService.sendMessage({
          chatId,
          text: fullMessage,
          parseMode: 'HTML',
        });
        
        alertEvent.sent = true;
        alertEvent.sentAt = new Date();
        this.logger.log(`Alert sent to ${recipient.userId}: ${alert.eventType}`);
      } catch (error) {
        alertEvent.error = error.message;
        this.logger.error(`Failed to send alert: ${error.message}`);
      }
    }

    await alertEvent.save();
  }

  /**
   * Find recipients for an event type
   */
  private async findRecipients(
    eventType: AlertEventType,
    teamId?: string,
  ): Promise<Array<{ userId: string; role: string; telegramChatId?: string; email?: string }>> {
    const recipients: Array<{ userId: string; role: string; telegramChatId?: string; email?: string }> = [];

    // Find users by role who should receive this event
    for (const [role, events] of Object.entries(ROLE_SUBSCRIPTIONS)) {
      if (!events.includes(eventType)) continue;

      const roleQuery: any = {};
      if (role === 'owner') {
        roleQuery.role = 'master_admin';
      } else if (role === 'team_lead') {
        roleQuery.role = 'team_lead';
        if (teamId) {
          roleQuery.$or = [{ teamId }, { id: teamId }];
        }
      } else if (role === 'manager') {
        roleQuery.role = 'manager';
      }

      const users = await this.userModel.find(roleQuery).lean();
      
      for (const user of users) {
        // Get alert settings for this user
        const settings = await this.alertSettingsModel.findOne({ userId: user.id }).lean();
        
        recipients.push({
          userId: user.id,
          role: user.role,
          telegramChatId: settings?.telegramChatId || user.telegramChatId,
          email: user.email,
        });
      }
    }

    return recipients;
  }

  /**
   * Render template with variables
   */
  private renderTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  // === CONVENIENCE METHODS FOR COMMON EVENTS ===

  async alertManagerLogin(managerId: string, managerName: string, ip: string, device: string): Promise<void> {
    await this.sendAlert({
      eventType: AlertEventType.MANAGER_LOGIN,
      metadata: {
        managerId,
        managerName,
        ip,
        device,
        time: new Date().toLocaleString('uk-UA'),
      },
      entityType: 'user',
      entityId: managerId,
    });
  }

  async alertSuspiciousLogin(userId: string, userName: string, ip: string, device: string): Promise<void> {
    await this.sendAlert({
      eventType: AlertEventType.MANAGER_LOGIN_SUSPICIOUS,
      priority: AlertPriority.CRITICAL,
      metadata: { userId, userName, ip, device },
      entityType: 'user',
      entityId: userId,
    });
  }

  async alertHotLeadCreated(leadId: string, customerName: string, phone: string, vin: string, managerName: string): Promise<void> {
    await this.sendAlert({
      eventType: AlertEventType.HOT_LEAD_CREATED,
      metadata: { leadId, customerName, phone, vin, managerName },
      entityType: 'lead',
      entityId: leadId,
    });
  }

  async alertPaymentReceived(customerId: string, customerName: string, amount: number, vehicleTitle: string): Promise<void> {
    await this.sendAlert({
      eventType: AlertEventType.INVOICE_PAID,
      metadata: { customerId, customerName, amount, vehicleTitle },
      entityType: 'invoice',
      entityId: customerId,
    });
  }

  async alertContractSigned(customerId: string, customerName: string, vehicleTitle: string, amount: number): Promise<void> {
    await this.sendAlert({
      eventType: AlertEventType.CONTRACT_SIGNED,
      metadata: { customerId, customerName, vehicleTitle, amount },
      entityType: 'contract',
      entityId: customerId,
    });
  }

  async alertCarfaxUploaded(vin: string, customerName: string, managerName: string): Promise<void> {
    await this.sendAlert({
      eventType: AlertEventType.CARFAX_UPLOADED,
      metadata: { vin, customerName, managerName },
      entityType: 'carfax',
      entityId: vin,
    });
  }

  async alertShipmentUpdate(vin: string, status: string, location: string, customerName?: string): Promise<void> {
    await this.sendAlert({
      eventType: AlertEventType.SHIPMENT_UPDATED,
      metadata: { vin, status, location, customerName },
      entityType: 'shipment',
      entityId: vin,
    });
  }

  // === SETTINGS MANAGEMENT ===

  async getSettings(userId: string): Promise<any> {
    return this.alertSettingsModel.findOne({ userId }).lean();
  }

  async updateSettings(userId: string, updates: Partial<AlertSettings>): Promise<any> {
    return this.alertSettingsModel.findOneAndUpdate(
      { userId },
      { $set: { ...updates, userId } },
      { new: true, upsert: true },
    ).lean();
  }

  async linkTelegram(userId: string, telegramChatId: string): Promise<any> {
    return this.updateSettings(userId, { telegramChatId, telegramEnabled: true });
  }

  // === ANALYTICS ===

  async getAlertStats(periodDays: number = 7): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [total, bySent, byType, byPriority] = await Promise.all([
      this.alertEventModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.alertEventModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$sent', count: { $sum: 1 } } },
      ]),
      this.alertEventModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      this.alertEventModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      total,
      sent: bySent.find(s => s._id === true)?.count || 0,
      failed: bySent.find(s => s._id === false)?.count || 0,
      byType: byType.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
      byPriority: byPriority.reduce((acc, p) => ({ ...acc, [p._id]: p.count }), {}),
      periodDays,
    };
  }

  // === CRITICAL ALERTS (for dashboards) ===
  
  async getCriticalAlerts(limit: number = 20): Promise<any> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const alerts = await this.alertEventModel.find({
      priority: { $in: [AlertPriority.CRITICAL, AlertPriority.HIGH] },
      createdAt: { $gte: last24Hours },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return {
      alerts: alerts.map(a => ({
        id: a.id,
        type: a.eventType,
        title: a.title,
        message: a.message,
        priority: a.priority,
        time: a.createdAt,
        entityType: a.entityType,
        entityId: a.entityId,
        managerName: (a as any).metadata?.managerName || null,
        manager: (a as any).metadata?.managerName ? { name: (a as any).metadata.managerName } : null,
      })),
      count: alerts.length,
    };
  }

  async getAlertLogs(limit: number = 50): Promise<any[]> {
    const logs = await this.alertEventModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    return logs;
  }
}
