import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CallbackQueue } from '../schemas/callback-queue.schema';
import { CallLog } from '../schemas/call-log.schema';
import { Lead } from '../../leads/lead.schema';
import { Task } from '../../tasks/task.schema';
import { User } from '../../users/user.schema';
import { ActivityService } from '../../activity/services/activity.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../../activity/enums/activity-action.enum';
import { NotificationType } from '../../../shared/enums';
import { generateId, toArrayResponse } from '../../../shared/utils';

// SLA конфігурація
export const SLA_CONFIG = {
  // Callback SLA
  CALLBACK_FIRST_RESPONSE_MINUTES: 5,      // Перша відповідь на missed call
  CALLBACK_FOLLOW_UP_MINUTES: 15,          // Follow-up після no answer
  CALLBACK_ESCALATION_1_MINUTES: 30,       // Перша ескалація
  CALLBACK_ESCALATION_2_MINUTES: 60,       // Друга ескалація
  CALLBACK_MAX_ATTEMPTS: 4,                // Максимум спроб

  // Lead SLA
  LEAD_FIRST_RESPONSE_MINUTES: 10,         // Перша відповідь на новий лід
  LEAD_NO_ACTIVITY_HOURS: 24,              // Без активності - попередження
  LEAD_STALE_HOURS: 48,                    // Застарілий лід

  // Manager Activity
  MANAGER_INACTIVE_MINUTES: 120,           // Неактивний менеджер
};

export interface SlaBreachRecord {
  id: string;
  type: 'callback' | 'lead' | 'task';
  entityId: string;
  managerId: string;
  managerName?: string;
  slaMinutes: number;
  actualMinutes: number;
  breachLevel: 1 | 2 | 3;
  escalatedTo?: string;
  escalatedAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface EscalationAction {
  level: number;
  action: 'notify_manager' | 'notify_admin' | 'reassign' | 'create_task' | 'alert_master';
  targetRole?: string;
  targetUserId?: string;
  taskPriority?: number;
}

@Injectable()
export class SlaBbreachService {
  private readonly logger = new Logger(SlaBbreachService.name);
  
  // In-memory breach cache (для швидкого доступу на dashboard)
  private slaBreaches: Map<string, SlaBreachRecord> = new Map();

  constructor(
    @InjectModel(CallbackQueue.name) private callbackModel: Model<CallbackQueue>,
    @InjectModel(CallLog.name) private callLogModel: Model<CallLog>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(User.name) private userModel: Model<User>,
    private activityService: ActivityService,
    private notificationsService: NotificationsService,
  ) {}

  // ==================== CRON JOBS ====================

  // Кожні 5 хвилин - перевірка callback SLA
  @Cron('*/5 * * * *')
  async checkCallbackSla() {
    this.logger.log('Running callback SLA check...');
    
    const now = new Date();
    const overdueCallbacks = await this.callbackModel.find({
      status: 'pending',
      scheduledAt: { $lt: now },
    }).exec();

    for (const callback of overdueCallbacks) {
      const minutesOverdue = Math.floor((now.getTime() - callback.scheduledAt.getTime()) / 60000);
      
      // Визначаємо рівень breach
      let breachLevel: 1 | 2 | 3 = 1;
      if (minutesOverdue >= SLA_CONFIG.CALLBACK_ESCALATION_2_MINUTES) {
        breachLevel = 3;
      } else if (minutesOverdue >= SLA_CONFIG.CALLBACK_ESCALATION_1_MINUTES) {
        breachLevel = 2;
      }

      // Перевіряємо чи вже зареєстровано breach
      const existingBreach = this.slaBreaches.get(`callback-${callback.id}`);
      if (!existingBreach || existingBreach.breachLevel < breachLevel) {
        await this.registerBreach({
          type: 'callback',
          entityId: callback.id,
          leadId: callback.leadId,
          managerId: callback.assignedTo,
          slaMinutes: SLA_CONFIG.CALLBACK_FIRST_RESPONSE_MINUTES,
          actualMinutes: minutesOverdue,
          breachLevel,
        });
      }
    }

    this.logger.log(`Callback SLA check complete. Found ${overdueCallbacks.length} overdue callbacks.`);
  }

  // Кожні 10 хвилин - перевірка lead SLA
  @Cron('*/10 * * * *')
  async checkLeadSla() {
    this.logger.log('Running lead SLA check...');
    
    const now = new Date();
    const firstResponseThreshold = new Date(now.getTime() - SLA_CONFIG.LEAD_FIRST_RESPONSE_MINUTES * 60000);

    // Нові ліди без відповіді
    const overdueLeads = await this.leadModel.find({
      status: 'new',
      isDeleted: false,
      assignedTo: { $exists: true, $ne: null },
      lastContactAt: { $exists: false },
    }).exec();

    for (const lead of overdueLeads) {
      // Використовуємо any для доступу до createdAt з timestamps
      const leadDoc = lead as any;
      const createdAt = leadDoc.createdAt ? new Date(leadDoc.createdAt) : new Date();
      
      if (createdAt > firstResponseThreshold) continue; // ще не overdue
      
      const minutesOverdue = Math.floor((now.getTime() - createdAt.getTime()) / 60000);
      
      if (!lead.assignedTo) continue;
      
      await this.registerBreach({
        type: 'lead',
        entityId: lead.id,
        leadId: lead.id,
        managerId: lead.assignedTo,
        slaMinutes: SLA_CONFIG.LEAD_FIRST_RESPONSE_MINUTES,
        actualMinutes: minutesOverdue,
        breachLevel: minutesOverdue > 30 ? 2 : 1,
      });
    }

    this.logger.log(`Lead SLA check complete. Found ${overdueLeads.length} overdue leads.`);
  }

  // Кожну годину - агрегація performance
  @Cron(CronExpression.EVERY_HOUR)
  async aggregatePerformance() {
    this.logger.log('Running hourly performance aggregation...');
    // Performance aggregation handled by ActivityAggregatorService
    // This cron just triggers cleanup of old breaches
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const [key, breach] of this.slaBreaches) {
      if (breach.resolvedAt && new Date(breach.resolvedAt) < oneDayAgo) {
        this.slaBreaches.delete(key);
      }
    }
  }

  // Щоденний звіт о 9:00
  @Cron('0 9 * * *')
  async dailySummary() {
    this.logger.log('Generating daily SLA summary...');
    
    const admins = await this.userModel.find({ 
      role: { $in: ['master_admin', 'admin'] }, 
      isActive: true 
    }).exec();

    const unresolvedBreaches = Array.from(this.slaBreaches.values())
      .filter(b => !b.resolvedAt);

    if (unresolvedBreaches.length > 0) {
      for (const admin of admins) {
        await this.notificationsService.create({
          userId: admin.id,
          type: NotificationType.SYSTEM,
          title: 'Щоденний SLA звіт',
          message: `${unresolvedBreaches.length} невирішених SLA порушень. Перегляньте dashboard.`,
          entityType: 'system',
          entityId: 'sla-report',
        });
      }
    }
  }

  // ==================== BREACH MANAGEMENT ====================

  async registerBreach(data: {
    type: 'callback' | 'lead' | 'task';
    entityId: string;
    leadId?: string;
    managerId: string;
    slaMinutes: number;
    actualMinutes: number;
    breachLevel: 1 | 2 | 3;
  }) {
    const breachId = `${data.type}-${data.entityId}`;
    const existingBreach = this.slaBreaches.get(breachId);
    
    // Якщо вже є breach того ж рівня - skip
    if (existingBreach && existingBreach.breachLevel >= data.breachLevel) {
      return;
    }

    // Отримуємо ім'я менеджера
    const manager = await this.userModel.findOne({ id: data.managerId });
    const managerName = manager ? `${manager.firstName} ${manager.lastName}` : 'Unknown';

    const breach: SlaBreachRecord = {
      id: generateId(),
      type: data.type,
      entityId: data.entityId,
      managerId: data.managerId,
      managerName,
      slaMinutes: data.slaMinutes,
      actualMinutes: data.actualMinutes,
      breachLevel: data.breachLevel,
      createdAt: new Date(),
    };

    this.slaBreaches.set(breachId, breach);

    // Activity log
    this.activityService.logAsync({
      userId: 'system',
      userRole: 'system',
      userName: 'SLA Monitor',
      action: ActivityAction.SLA_BREACH,
      entityType: data.type === 'lead' ? ActivityEntityType.LEAD : 
                  data.type === 'callback' ? ActivityEntityType.CALL : ActivityEntityType.TASK,
      entityId: data.entityId,
      meta: {
        breachLevel: data.breachLevel,
        slaMinutes: data.slaMinutes,
        actualMinutes: data.actualMinutes,
        managerId: data.managerId,
        managerName,
      },
      context: { source: ActivitySource.SYSTEM },
    });

    // Виконуємо ескалацію
    await this.executeEscalation(breach);

    this.logger.warn(
      `SLA BREACH [Level ${data.breachLevel}]: ${data.type} ${data.entityId} ` +
      `by ${managerName} - ${data.actualMinutes}min overdue (SLA: ${data.slaMinutes}min)`
    );
  }

  // ==================== ESCALATION ENGINE ====================

  private async executeEscalation(breach: SlaBreachRecord) {
    const actions = this.getEscalationActions(breach.breachLevel);

    for (const action of actions) {
      try {
        switch (action.action) {
          case 'notify_manager':
            await this.notifyManager(breach);
            break;
          case 'notify_admin':
            await this.notifyAdmins(breach);
            break;
          case 'create_task':
            await this.createEscalationTask(breach, action.taskPriority || 3);
            break;
          case 'reassign':
            await this.triggerReassignment(breach);
            break;
          case 'alert_master':
            await this.alertMasterAdmin(breach);
            break;
        }
      } catch (error) {
        this.logger.error(`Escalation action failed: ${action.action}`, error);
      }
    }
  }

  private getEscalationActions(level: 1 | 2 | 3): EscalationAction[] {
    const actions: Record<number, EscalationAction[]> = {
      1: [
        { level: 1, action: 'notify_manager' },
      ],
      2: [
        { level: 2, action: 'notify_manager' },
        { level: 2, action: 'notify_admin' },
        { level: 2, action: 'create_task', taskPriority: 2 },
      ],
      3: [
        { level: 3, action: 'notify_manager' },
        { level: 3, action: 'notify_admin' },
        { level: 3, action: 'alert_master' },
        { level: 3, action: 'create_task', taskPriority: 1 },
      ],
    };
    return actions[level] || [];
  }

  private async notifyManager(breach: SlaBreachRecord) {
    await this.notificationsService.create({
      userId: breach.managerId,
      type: NotificationType.TASK_DUE,
      title: `SLA порушення (рівень ${breach.breachLevel})`,
      message: `Ви просрочили ${breach.type === 'callback' ? 'callback' : 'роботу з лідом'} на ${breach.actualMinutes} хв. SLA: ${breach.slaMinutes} хв.`,
      entityType: breach.type,
      entityId: breach.entityId,
    });
  }

  private async notifyAdmins(breach: SlaBreachRecord) {
    const admins = await this.userModel.find({ 
      role: { $in: ['admin'] }, 
      isActive: true 
    }).exec();

    for (const admin of admins) {
      await this.notificationsService.create({
        userId: admin.id,
        type: NotificationType.SYSTEM,
        title: `SLA Breach Alert - ${breach.managerName}`,
        message: `${breach.type} просрочено на ${breach.actualMinutes} хв. Менеджер: ${breach.managerName}`,
        entityType: breach.type,
        entityId: breach.entityId,
      });
    }

    breach.escalatedTo = 'admin';
    breach.escalatedAt = new Date();
  }

  private async alertMasterAdmin(breach: SlaBreachRecord) {
    const masters = await this.userModel.find({ 
      role: 'master_admin', 
      isActive: true 
    }).exec();

    for (const master of masters) {
      await this.notificationsService.create({
        userId: master.id,
        type: NotificationType.SYSTEM,
        title: `CRITICAL SLA BREACH - ${breach.managerName}`,
        message: `${breach.type} просрочено на ${breach.actualMinutes} хв. Потрібне втручання!`,
        entityType: breach.type,
        entityId: breach.entityId,
      });
    }

    breach.escalatedTo = 'master_admin';
    breach.escalatedAt = new Date();
  }

  private async createEscalationTask(breach: SlaBreachRecord, priority: number) {
    const task = new this.taskModel({
      id: generateId(),
      title: `SLA Breach: ${breach.type} потребує уваги`,
      description: `Автоматично створена задача через SLA порушення.\n` +
                   `Тип: ${breach.type}\n` +
                   `Просрочено на: ${breach.actualMinutes} хв\n` +
                   `Менеджер: ${breach.managerName}`,
      assignedTo: breach.managerId,
      priority,
      dueDate: new Date(Date.now() + 30 * 60000), // 30 хвилин
      status: 'pending',
      relatedTo: breach.type,
      relatedId: breach.entityId,
      createdBy: 'system',
    });
    await task.save();
  }

  private async triggerReassignment(breach: SlaBreachRecord) {
    // Логіка reassignment - можна інтегрувати з LeadRoutingService
    this.logger.warn(`Reassignment triggered for ${breach.type} ${breach.entityId}`);
    // TODO: Інтегрувати з LeadRoutingService для автоматичного переназначення
  }

  // ==================== RESOLVE BREACH ====================

  async resolveBreach(type: string, entityId: string) {
    const breachId = `${type}-${entityId}`;
    const breach = this.slaBreaches.get(breachId);
    if (breach) {
      breach.resolvedAt = new Date();
      this.slaBreaches.set(breachId, breach);
    }
  }

  // ==================== DASHBOARD DATA ====================

  getActiveBreaches(): SlaBreachRecord[] {
    return Array.from(this.slaBreaches.values())
      .filter(b => !b.resolvedAt)
      .sort((a, b) => b.breachLevel - a.breachLevel);
  }

  getBreachesByManager(managerId: string): SlaBreachRecord[] {
    return Array.from(this.slaBreaches.values())
      .filter(b => b.managerId === managerId && !b.resolvedAt);
  }

  getBreachStats(): {
    total: number;
    byLevel: Record<number, number>;
    byType: Record<string, number>;
    byManager: Record<string, number>;
  } {
    const breaches = Array.from(this.slaBreaches.values()).filter(b => !b.resolvedAt);
    
    return {
      total: breaches.length,
      byLevel: {
        1: breaches.filter(b => b.breachLevel === 1).length,
        2: breaches.filter(b => b.breachLevel === 2).length,
        3: breaches.filter(b => b.breachLevel === 3).length,
      },
      byType: breaches.reduce((acc, b) => {
        acc[b.type] = (acc[b.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byManager: breaches.reduce((acc, b) => {
        const key = b.managerName || b.managerId;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
