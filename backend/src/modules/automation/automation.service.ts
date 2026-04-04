import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { AutomationRule } from './schemas/automation-rule.schema';
import { AutomationLog } from './schemas/automation-log.schema';
import { AutomationTrigger, AutomationAction, NotificationType, CommunicationChannel } from '../../shared/enums';
import { generateId, toObjectResponse, toArrayResponse } from '../../shared/utils';
import { TasksService } from '../tasks/tasks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LeadRoutingService } from '../lead-routing/services/lead-routing.service';

interface TriggerEvent {
  trigger: AutomationTrigger;
  entityType: string;
  entityId: string;
  data: Record<string, any>;
  userId?: string;
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectModel(AutomationRule.name) private ruleModel: Model<AutomationRule>,
    @InjectModel(AutomationLog.name) private logModel: Model<AutomationLog>,
    @InjectQueue('automation') private automationQueue: Queue,
    @InjectQueue('communications') private communicationsQueue: Queue,
    private tasksService: TasksService,
    private notificationsService: NotificationsService,
    @Inject(forwardRef(() => LeadRoutingService)) private leadRoutingService: LeadRoutingService,
  ) {}

  // Викликається при події в системі
  async emit(event: TriggerEvent): Promise<void> {
    this.logger.log(`Automation trigger: ${event.trigger} for ${event.entityType}:${event.entityId}`);
    
    // Знаходимо активні правила для цього тригера
    const rules = await this.ruleModel.find({
      trigger: event.trigger,
      isActive: true,
    }).sort({ priority: -1 });

    for (const rule of rules) {
      // Перевіряємо умови
      if (this.checkConditions(rule.triggerConditions, event.data)) {
        if (rule.delayMinutes > 0) {
          // Відкладена дія через чергу
          await this.automationQueue.add('execute-rule', {
            ruleId: rule.id,
            event,
          }, { delay: rule.delayMinutes * 60 * 1000 });
        } else {
          // Негайне виконання
          await this.executeRule(rule, event);
        }
      }
    }
  }

  private checkConditions(conditions: Record<string, any> | undefined, data: Record<string, any>): boolean {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }

    for (const [key, value] of Object.entries(conditions)) {
      if (data[key] !== value) {
        return false;
      }
    }
    return true;
  }

  async executeRule(rule: AutomationRule, event: TriggerEvent): Promise<void> {
    const log = new this.logModel({
      id: generateId(),
      ruleId: rule.id,
      ruleName: rule.name,
      trigger: event.trigger,
      entityType: event.entityType,
      entityId: event.entityId,
      actionsExecuted: [],
      status: 'running',
      executedAt: new Date(),
    });

    try {
      for (const actionDef of rule.actions) {
        const actionResult = await this.executeAction(actionDef.action, actionDef.params, event);
        log.actionsExecuted.push({
          action: actionDef.action,
          status: actionResult.success ? 'success' : 'failed',
          result: actionResult.data,
          error: actionResult.error,
        });
      }

      log.status = 'completed';
      
      // Оновлюємо лічильник правила
      await this.ruleModel.findOneAndUpdate(
        { id: rule.id },
        { $inc: { executionCount: 1 }, $set: { lastExecutedAt: new Date() } }
      );
    } catch (error) {
      log.status = 'failed';
      log.error = error.message;
      this.logger.error(`Automation rule ${rule.id} failed: ${error.message}`);
    }

    await log.save();
  }

  private async executeAction(
    action: AutomationAction,
    params: Record<string, any>,
    event: TriggerEvent
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      switch (action) {
        case AutomationAction.CREATE_TASK:
          const task = await this.tasksService.create({
            title: this.interpolate(params.title, event.data),
            description: this.interpolate(params.description, event.data),
            priority: params.priority || 'medium',
            dueDate: params.dueDateMinutes 
              ? new Date(Date.now() + params.dueDateMinutes * 60 * 1000)
              : undefined,
            assignedTo: params.assignTo === 'lead_owner' 
              ? event.data.assignedTo 
              : params.assignTo,
            relatedEntityType: event.entityType,
            relatedEntityId: event.entityId,
          }, event.userId || 'system');
          return { success: true, data: { taskId: task.id } };

        case AutomationAction.SEND_NOTIFICATION:
          await this.notificationsService.create({
            userId: params.userId || event.data.assignedTo || event.userId,
            type: params.notificationType || NotificationType.SYSTEM,
            title: this.interpolate(params.title, event.data),
            message: this.interpolate(params.message, event.data),
            entityType: event.entityType,
            entityId: event.entityId,
          });
          return { success: true };

        case AutomationAction.ESCALATE_TO_ADMIN:
          // Знаходимо всіх адмінів і відправляємо нотифікацію
          // Тут має бути логіка отримання адмінів
          this.logger.warn(`Escalation triggered for ${event.entityType}:${event.entityId}`);
          return { success: true, data: { escalated: true } };

        case AutomationAction.SCHEDULE_CALLBACK:
          const callbackTask = await this.tasksService.create({
            title: `Callback: ${event.data.firstName || ''} ${event.data.lastName || ''}`,
            description: `Зателефонувати клієнту. Телефон: ${event.data.phone || 'не вказано'}`,
            priority: 'high',
            dueDate: new Date(Date.now() + (params.delayMinutes || 10) * 60 * 1000),
            assignedTo: event.data.assignedTo,
            relatedEntityType: event.entityType,
            relatedEntityId: event.entityId,
            isReminder: true,
          }, event.userId || 'system');
          return { success: true, data: { taskId: callbackTask.id } };

        case AutomationAction.SCHEDULE_FOLLOW_UP:
          const followUpTask = await this.tasksService.create({
            title: `Follow-up: ${event.data.firstName || ''} ${event.data.lastName || ''}`,
            description: params.message || 'Повторний контакт з клієнтом',
            priority: 'medium',
            dueDate: new Date(Date.now() + (params.delayMinutes || 2880) * 60 * 1000), // 2 дні за замовч.
            assignedTo: event.data.assignedTo,
            relatedEntityType: event.entityType,
            relatedEntityId: event.entityId,
          }, event.userId || 'system');
          return { success: true, data: { taskId: followUpTask.id } };

        case AutomationAction.SEND_SMS:
          // Add SMS to communications queue
          if (!event.data.phone) {
            return { success: false, error: 'No phone number available for SMS' };
          }
          
          const smsMessage = this.interpolate(params.message || '', event.data);
          await this.communicationsQueue.add('send', {
            logId: generateId(),
            channel: CommunicationChannel.SMS,
            recipient: event.data.phone,
            subject: 'AutoCRM SMS',
            content: smsMessage,
            metadata: {
              leadId: event.entityType === 'lead' ? event.entityId : undefined,
              customerId: event.entityType === 'customer' ? event.entityId : undefined,
              attemptNumber: event.data.callAttempts || 1,
            },
          });
          this.logger.log(`SMS queued for ${event.data.phone}`);
          return { success: true, data: { queued: true, phone: event.data.phone } };

        case AutomationAction.SEND_EMAIL:
          // Add Email to communications queue
          if (!event.data.email) {
            return { success: false, error: 'No email available' };
          }
          
          const emailSubject = this.interpolate(params.subject || 'AutoCRM Notification', event.data);
          const emailContent = this.interpolate(params.content || params.message || '', event.data);
          await this.communicationsQueue.add('send', {
            logId: generateId(),
            channel: CommunicationChannel.EMAIL,
            recipient: event.data.email,
            subject: emailSubject,
            content: emailContent,
            metadata: {
              leadId: event.entityType === 'lead' ? event.entityId : undefined,
              customerId: event.entityType === 'customer' ? event.entityId : undefined,
            },
          });
          this.logger.log(`Email queued for ${event.data.email}`);
          return { success: true, data: { queued: true, email: event.data.email } };

        case AutomationAction.ASSIGN_MANAGER:
          // Auto-assign lead to manager via routing engine
          if (event.entityType !== 'lead') {
            return { success: false, error: 'ASSIGN_MANAGER only works for leads' };
          }
          
          try {
            const assignResult = await this.leadRoutingService.assignLead(event.entityId);
            if (assignResult.success) {
              this.logger.log(`Lead ${event.entityId} assigned to ${assignResult.managerId} via ${assignResult.strategy}`);
              return { 
                success: true, 
                data: { 
                  managerId: assignResult.managerId,
                  managerName: assignResult.managerName,
                  strategy: assignResult.strategy,
                } 
              };
            } else {
              this.logger.warn(`Lead assignment failed: ${assignResult.reason}`);
              return { success: false, error: assignResult.reason };
            }
          } catch (routingError) {
            this.logger.error(`Lead routing error: ${routingError.message}`);
            return { success: false, error: routingError.message };
          }

        default:
          this.logger.warn(`Unknown action: ${action}`);
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private interpolate(template: string, data: Record<string, any>): string {
    if (!template) return '';
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  }

  // CRUD для правил автоматизації
  async createRule(data: Partial<AutomationRule>): Promise<any> {
    const rule = new this.ruleModel({ id: generateId(), ...data });
    return toObjectResponse(await rule.save());
  }

  async findAllRules(): Promise<any[]> {
    const rules = await this.ruleModel.find().sort({ priority: -1 });
    return toArrayResponse(rules);
  }

  async updateRule(id: string, data: Partial<AutomationRule>): Promise<any> {
    const rule = await this.ruleModel.findOneAndUpdate(
      { id },
      { $set: data },
      { new: true }
    );
    return rule ? toObjectResponse(rule) : null;
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await this.ruleModel.findOneAndDelete({ id });
    return !!result;
  }

  async findLogs(query: { ruleId?: string; entityType?: string; entityId?: string; limit?: number }): Promise<any[]> {
    const filter: any = {};
    if (query.ruleId) filter.ruleId = query.ruleId;
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;

    const logs = await this.logModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit || 100);
    return toArrayResponse(logs);
  }

  // Дефолтні правила автоматизації
  async bootstrapDefaultRules(): Promise<void> {
    const existingRules = await this.ruleModel.countDocuments();
    if (existingRules > 0) return;

    const defaultRules = [
      // === LEAD LIFECYCLE ===
      {
        name: 'Новий лід - авто-призначення менеджера',
        description: 'Коли створюється новий лід, автоматично призначається менеджер через routing engine',
        trigger: AutomationTrigger.LEAD_CREATED,
        actions: [
          {
            action: AutomationAction.ASSIGN_MANAGER,
            params: {}
          },
          {
            action: AutomationAction.SEND_NOTIFICATION,
            params: {
              notificationType: NotificationType.NEW_LEAD,
              title: 'Новий лід',
              message: 'Новий лід: {{firstName}} {{lastName}}. Зателефонуйте протягом 10 хвилин.'
            }
          }
        ],
        isActive: true,
        priority: 100,
      },

      // === NO ANSWER WORKFLOW (Bulgaria-optimized) ===
      {
        name: 'Перший no_answer - follow-up через 2 години',
        description: 'Якщо клієнт не відповів на перший дзвінок, створити follow-up задачу через 2 години',
        trigger: AutomationTrigger.CALL_MISSED,
        triggerConditions: { callAttempts: 1 },
        actions: [
          {
            action: AutomationAction.SCHEDULE_FOLLOW_UP,
            params: { delayMinutes: 120, message: 'Повторний дзвінок - клієнт не відповів (спроба 1)' }
          }
        ],
        isActive: true,
        priority: 85,
      },
      {
        name: 'Другий no_answer - follow-up через 2 дні',
        description: 'Якщо клієнт не відповів вдруге, створити follow-up через 2 дні',
        trigger: AutomationTrigger.CALL_MISSED,
        triggerConditions: { callAttempts: 2 },
        actions: [
          {
            action: AutomationAction.SCHEDULE_FOLLOW_UP,
            params: { delayMinutes: 2880, message: 'Повторний дзвінок - клієнт не відповів (спроба 2)' }
          }
        ],
        isActive: true,
        priority: 84,
      },
      {
        name: 'Третій no_answer - відправити SMS',
        description: 'Після 2 невдалих спроб відправити SMS клієнту',
        trigger: AutomationTrigger.CALL_MISSED,
        triggerConditions: { callAttempts: 3 },
        actions: [
          {
            action: AutomationAction.SEND_SMS,
            params: {
              templateType: 'no_answer',
              message: 'Доброго дня, {{firstName}}! Ми намагалися зв\'язатися з вами. Зателефонуйте нам: {{managerPhone}} або напишіть.'
            }
          },
          {
            action: AutomationAction.SCHEDULE_FOLLOW_UP,
            params: { delayMinutes: 4320, message: 'Фінальна спроба контакту після SMS (3 дні)' }
          }
        ],
        isActive: true,
        priority: 83,
      },
      {
        name: 'Четвертий no_answer - перевести в cold/unreachable',
        description: 'Якщо клієнт не відповів після SMS, перевести в unreachable статус',
        trigger: AutomationTrigger.CALL_MISSED,
        triggerConditions: { callAttempts: 4 },
        actions: [
          {
            action: AutomationAction.SEND_NOTIFICATION,
            params: {
              notificationType: NotificationType.SYSTEM,
              title: 'Лід unreachable',
              message: 'Лід {{firstName}} {{lastName}} переведено в статус unreachable після 4 спроб контакту'
            }
          }
        ],
        isActive: true,
        priority: 82,
      },

      // === TASK MANAGEMENT ===
      {
        name: 'Прострочена задача - ескалація',
        description: 'Якщо задача прострочена, ескалювати адміну',
        trigger: AutomationTrigger.TASK_OVERDUE,
        actions: [
          {
            action: AutomationAction.ESCALATE_TO_ADMIN,
            params: {}
          },
          {
            action: AutomationAction.SEND_NOTIFICATION,
            params: {
              notificationType: NotificationType.TASK_OVERDUE,
              title: 'Прострочена задача',
              message: 'Задача "{{title}}" прострочена!'
            }
          }
        ],
        isActive: true,
        priority: 90,
      },

      // === DEPOSIT WORKFLOW ===
      {
        name: 'Депозит отримано - повідомлення',
        description: 'Коли отримано депозит, повідомити менеджера',
        trigger: AutomationTrigger.DEPOSIT_RECEIVED,
        actions: [
          {
            action: AutomationAction.SEND_NOTIFICATION,
            params: {
              notificationType: NotificationType.DEPOSIT_RECEIVED,
              title: 'Депозит отримано',
              message: 'Клієнт вніс депозит: {{amount}} USD'
            }
          }
        ],
        isActive: true,
        priority: 95,
      },

      // === NO RESPONSE TRIGGERS ===
      {
        name: 'Немає відповіді 24 години - нагадування',
        description: 'Якщо лід не контактував 24 години, нагадати менеджеру',
        trigger: AutomationTrigger.NO_RESPONSE_24H,
        actions: [
          {
            action: AutomationAction.SEND_NOTIFICATION,
            params: {
              notificationType: NotificationType.SYSTEM,
              title: 'Нагадування',
              message: 'Лід {{firstName}} {{lastName}} не контактував більше 24 годин'
            }
          },
          {
            action: AutomationAction.SCHEDULE_CALLBACK,
            params: { delayMinutes: 30 }
          }
        ],
        isActive: true,
        priority: 70,
      },
      {
        name: 'Немає відповіді 48 годин - ескалація',
        description: 'Якщо лід не контактував 48 годин, ескалювати',
        trigger: AutomationTrigger.NO_RESPONSE_48H,
        actions: [
          {
            action: AutomationAction.ESCALATE_TO_ADMIN,
            params: {}
          },
          {
            action: AutomationAction.SEND_NOTIFICATION,
            params: {
              notificationType: NotificationType.SYSTEM,
              title: 'Ескалація: немає контакту',
              message: 'Лід {{firstName}} {{lastName}} не контактував більше 48 годин. Потрібна увага!'
            }
          }
        ],
        isActive: true,
        priority: 75,
      },
    ];

    for (const rule of defaultRules) {
      await this.createRule(rule);
    }

    this.logger.log(`Created ${defaultRules.length} default automation rules`);
  }
}
