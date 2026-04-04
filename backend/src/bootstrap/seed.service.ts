import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { generateId } from '../shared/utils';
import { 
  UserRole, 
  LeadStatus, 
  LeadSource, 
  ContactStatus,
  AutomationTrigger,
  AutomationAction,
  NotificationType,
  CommunicationChannel,
  CustomerType,
} from '../shared/enums';

/**
 * Seed Service v3.0 - Повна ініціалізація системи
 * 
 * Виправлення:
 * - Додано seedTestCustomers для тестових клієнтів
 * - Idempotent операції (безпечні для повторного запуску)
 * - Покращена обробка помилок
 * - Підтримка legacy master_admin ролі
 */

interface SeedResult {
  users: number;
  leads?: number;
  staff: number;
  customers: number;
  automationRules: number;
  routingRules: number;
  messageTemplates: number;
  settings: number;
  slaSettings: number;
}

export { SeedResult };

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);
  private customerModel: Model<any> | null = null;

  constructor(
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Lead') private leadModel: Model<any>,
    @InjectModel('Customer') private injectedCustomerModel: Model<any>,
    @InjectModel('AutomationRule') private automationRuleModel: Model<any>,
    @InjectModel('MessageTemplate') private messageTemplateModel: Model<any>,
    @InjectModel('Setting') private settingsModel: Model<any>,
  ) {
    this.customerModel = this.injectedCustomerModel;
  }

  // ==================== CHECK METHODS ====================

  async isColdStart(): Promise<boolean> {
    // Check for owner (new role) or master_admin (legacy)
    const ownerCount = await this.userModel.countDocuments({ 
      role: { $in: [UserRole.OWNER, 'master_admin'] } 
    });
    return ownerCount === 0;
  }

  async hasStaff(): Promise<boolean> {
    const count = await this.userModel.countDocuments({ 
      role: { $nin: [UserRole.OWNER, 'master_admin'] } 
    });
    return count > 0;
  }

  async hasCustomers(): Promise<boolean> {
    try {
      if (!this.customerModel) return false;
      const count = await this.customerModel.countDocuments();
      return count > 0;
    } catch {
      return false;
    }
  }

  async hasAutomationRules(): Promise<boolean> {
    const count = await this.automationRuleModel.countDocuments();
    return count > 0;
  }

  async hasRoutingRules(): Promise<boolean> {
    const rules = await this.settingsModel.findOne({ key: 'routing_rules' });
    return !!rules;
  }

  async hasMessageTemplates(): Promise<boolean> {
    const count = await this.messageTemplateModel.countDocuments();
    return count > 0;
  }

  async hasSettings(): Promise<boolean> {
    const count = await this.settingsModel.countDocuments();
    return count > 0;
  }

  // ==================== MAIN SEED ====================

  async seedAll(): Promise<SeedResult> {
    this.logger.log('🌱 Starting full system seed v3.0...');

    const result: SeedResult = {
      users: 0,
      staff: 0,
      customers: 0,
      automationRules: 0,
      routingRules: 0,
      messageTemplates: 0,
      settings: 0,
      slaSettings: 0,
    };

    try {
      // 1. Users & Staff
      result.users = await this.seedUsers();
      result.staff = await this.seedStaff();

      // 2. Test Customers
      result.customers = await this.seedTestCustomers();

      // 3. Automation Rules
      result.automationRules = await this.seedAutomationRules();

      // 4. Routing Rules
      result.routingRules = await this.seedRoutingRules();

      // 5. Message Templates
      result.messageTemplates = await this.seedMessageTemplates();

      // 6. System Settings
      result.settings = await this.seedSettings();

      // 7. SLA Settings
      result.slaSettings = await this.seedSlaSettings();
      
      this.logger.log(`✅ Full seed completed: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error(`❌ Seed failed: ${error.message}`);
      throw error;
    }

    return result;
  }

  async seedMissing(): Promise<void> {
    this.logger.log('🔍 Checking for missing data...');
    
    if (!await this.hasStaff()) {
      await this.seedStaff();
    }
    if (!await this.hasCustomers()) {
      await this.seedTestCustomers();
    }
    if (!await this.hasAutomationRules()) {
      await this.seedAutomationRules();
    }
    if (!await this.hasRoutingRules()) {
      await this.seedRoutingRules();
    }
    if (!await this.hasMessageTemplates()) {
      await this.seedMessageTemplates();
    }
    
    // Ensure all settings exist
    await this.seedSettings();
    await this.seedSlaSettings();
  }

  // ==================== USERS ====================

  async seedUsers(): Promise<number> {
    try {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const admin = {
        id: generateId(),
        email: 'admin@crm.com',
        password: hashedPassword,
        firstName: 'Master',
        lastName: 'Admin',
        phone: '+380501234567',
        role: UserRole.OWNER,
        isActive: true,
      };

      // Use upsert to avoid duplicate key errors
      const result = await this.userModel.findOneAndUpdate(
        { email: 'admin@crm.com' },
        { $setOnInsert: admin },
        { upsert: true, new: true, rawResult: true }
      );

      if (result.lastErrorObject?.updatedExisting) {
        this.logger.log('✓ Admin user already exists');
        return 0;
      }
      
      this.logger.log('✓ Created owner: admin@crm.com / admin123');
      return 1;
    } catch (error) {
      if (error.code === 11000) {
        this.logger.log('✓ Admin user already exists (duplicate key)');
        return 0;
      }
      this.logger.error(`Failed to seed admin: ${error.message}`);
      return 0;
    }
  }

  // ==================== TEST CUSTOMERS ====================

  async seedTestCustomers(): Promise<number> {
    try {
      if (!this.customerModel) {
        this.logger.warn('Customer model not available');
        return 0;
      }
      
      // Check if test customers exist
      const existingCount = await this.customerModel.countDocuments({ 
        email: { $regex: /^test\.customer/ } 
      });
      
      if (existingCount >= 5) {
        this.logger.log(`✓ Test customers already exist (${existingCount})`);
        return 0;
      }

      // Get managers for assignment
      const managers = await this.userModel.find({ 
        role: UserRole.MANAGER, 
        isActive: true 
      }).lean();

      const testCustomers = [
        {
          id: generateId(),
          firstName: 'Андрій',
          lastName: 'Тестовий',
          email: 'test.customer1@example.com',
          phone: '+380501111111',
          type: CustomerType.INDIVIDUAL,
          status: 'active',
          country: 'Ukraine',
          city: 'Kyiv',
          totalDeals: 2,
          totalDeposits: 1,
          totalValue: 15000,
          lifetimeValue: 15000,
          assignedTo: managers[0]?.id,
        },
        {
          id: generateId(),
          firstName: 'Олена',
          lastName: 'Клієнт',
          email: 'test.customer2@example.com',
          phone: '+380502222222',
          type: CustomerType.INDIVIDUAL,
          status: 'vip',
          country: 'Bulgaria',
          city: 'Sofia',
          totalDeals: 5,
          totalDeposits: 3,
          totalValue: 45000,
          lifetimeValue: 45000,
          assignedTo: managers[0]?.id,
        },
        {
          id: generateId(),
          firstName: 'Ivan',
          lastName: 'Petrov',
          email: 'test.customer3@example.com',
          phone: '+359888333333',
          type: CustomerType.INDIVIDUAL,
          status: 'active',
          country: 'Bulgaria',
          city: 'Plovdiv',
          totalDeals: 1,
          totalDeposits: 1,
          totalValue: 8000,
          lifetimeValue: 8000,
          assignedTo: managers[1]?.id,
        },
        {
          id: generateId(),
          firstName: 'Auto',
          lastName: 'Company Ltd',
          email: 'test.customer4@example.com',
          phone: '+380504444444',
          company: 'Auto Company Ltd',
          type: CustomerType.COMPANY,
          status: 'active',
          country: 'Ukraine',
          city: 'Odesa',
          totalDeals: 10,
          totalDeposits: 5,
          totalValue: 120000,
          lifetimeValue: 120000,
          assignedTo: managers[1]?.id,
        },
        {
          id: generateId(),
          firstName: 'Maria',
          lastName: 'Georgieva',
          email: 'test.customer5@example.com',
          phone: '+359888555555',
          type: CustomerType.INDIVIDUAL,
          status: 'active',
          country: 'Bulgaria',
          city: 'Varna',
          totalDeals: 0,
          totalDeposits: 0,
          totalValue: 0,
          lifetimeValue: 0,
          assignedTo: managers[2]?.id,
        },
      ];

      // Insert customers
      let created = 0;
      for (const customer of testCustomers) {
        try {
          const existing = await this.customerModel.findOne({ email: customer.email });
          if (!existing) {
            await this.customerModel.create(customer);
            created++;
          }
        } catch (e) {
          this.logger.warn(`Could not create customer ${customer.email}: ${e.message}`);
        }
      }

      this.logger.log(`✓ Created ${created} test customers`);
      return created;
    } catch (error) {
      this.logger.warn(`Could not seed test customers: ${error.message}`);
      return 0;
    }
  }

  async seedStaff(): Promise<number> {
    // Check if staff with new emails already exists
    const existingTeamLead = await this.userModel.findOne({ email: 'teamlead@crm.com' });
    if (existingTeamLead) {
      this.logger.log(`✓ Staff already exists (teamlead found)`);
      return 0;
    }

    const hashedPassword = await bcrypt.hash('staff123', 10);
    
    // First create team lead
    const teamLeadId = generateId();
    
    const staff = [
      {
        id: teamLeadId,
        email: 'teamlead@crm.com',
        password: hashedPassword,
        firstName: 'Олександр',
        lastName: 'Керівник',
        phone: '+380501111111',
        role: UserRole.TEAM_LEAD,
        isActive: true,
      },
      {
        id: generateId(),
        email: 'manager1@crm.com',
        password: hashedPassword,
        firstName: 'Іван',
        lastName: 'Менеджер',
        phone: '+380503333333',
        role: UserRole.MANAGER,
        teamLeadId: teamLeadId, // Linked to team lead
        isActive: true,
      },
      {
        id: generateId(),
        email: 'manager2@crm.com',
        password: hashedPassword,
        firstName: 'Олена',
        lastName: 'Менеджер',
        phone: '+380504444444',
        role: UserRole.MANAGER,
        teamLeadId: teamLeadId, // Linked to team lead
        isActive: true,
      },
      {
        id: generateId(),
        email: 'manager3@crm.com',
        password: hashedPassword,
        firstName: 'Петро',
        lastName: 'Менеджер',
        phone: '+380505555555',
        role: UserRole.MANAGER,
        teamLeadId: teamLeadId, // Linked to team lead
        isActive: true,
      },
    ];

    // Insert staff, skip existing emails
    for (const member of staff) {
      try {
        const existing = await this.userModel.findOne({ email: member.email });
        if (!existing) {
          await this.userModel.create(member);
        }
      } catch (e) {
        this.logger.warn(`Could not create user ${member.email}: ${e.message}`);
      }
    }
    
    this.logger.log(`✓ Created staff members (1 team lead, 3 managers)`);
    return staff.length;
  }

  // ==================== AUTOMATION RULES ====================

  async seedAutomationRules(): Promise<number> {
    const existingRules = await this.automationRuleModel.countDocuments();
    if (existingRules > 0) {
      this.logger.log(`✓ Automation rules already exist (${existingRules})`);
      return 0;
    }

    const rules = [
      // === Lead Lifecycle ===
      {
        id: generateId(),
        name: 'Новий лід → Callback за 10 хв',
        description: 'При створенні нового ліда автоматично планується callback через 10 хвилин',
        trigger: AutomationTrigger.LEAD_CREATED,
        actions: [
          { action: AutomationAction.SCHEDULE_CALLBACK, params: { delayMinutes: 10 } },
          { action: AutomationAction.SEND_NOTIFICATION, params: { 
            notificationType: NotificationType.NEW_LEAD, 
            title: 'Новий лід', 
            message: 'Новий лід: {{firstName}} {{lastName}} з {{source}}. Зателефонуйте протягом 10 хвилин.' 
          }}
        ],
        isActive: true,
        priority: 100,
      },
      {
        id: generateId(),
        name: 'Лід призначено → Welcome SMS',
        description: 'При призначенні ліда менеджеру відправляється welcome SMS клієнту',
        trigger: AutomationTrigger.LEAD_ASSIGNED,
        actions: [
          { action: AutomationAction.SEND_SMS, params: { templateType: 'welcome' } },
          { action: AutomationAction.SEND_NOTIFICATION, params: { 
            notificationType: NotificationType.LEAD_ASSIGNED, 
            title: 'Новий лід призначено', 
            message: 'Вам призначено ліда: {{firstName}} {{lastName}}' 
          }}
        ],
        isActive: true,
        priority: 95,
      },

      // === No-Answer Workflow ===
      {
        id: generateId(),
        name: 'No Answer #1 → Follow-up через 2 години',
        description: 'Перший невдалий дзвінок: follow-up через 2 години',
        trigger: AutomationTrigger.CALL_MISSED,
        triggerConditions: { callAttempts: 1 },
        actions: [
          { action: AutomationAction.SCHEDULE_FOLLOW_UP, params: { 
            delayMinutes: 120, 
            message: 'Повторний дзвінок - клієнт не відповів (спроба 1)' 
          }}
        ],
        isActive: true,
        priority: 85,
      },
      {
        id: generateId(),
        name: 'No Answer #2 → Follow-up через 1 день',
        description: 'Другий невдалий дзвінок: follow-up через день',
        trigger: AutomationTrigger.CALL_MISSED,
        triggerConditions: { callAttempts: 2 },
        actions: [
          { action: AutomationAction.SCHEDULE_FOLLOW_UP, params: { 
            delayMinutes: 1440, 
            message: 'Повторний дзвінок - клієнт не відповів (спроба 2)' 
          }}
        ],
        isActive: true,
        priority: 84,
      },
      {
        id: generateId(),
        name: 'No Answer #3 → SMS + Follow-up через 2 дні',
        description: 'Третій невдалий дзвінок: SMS та follow-up через 2 дні',
        trigger: AutomationTrigger.CALL_MISSED,
        triggerConditions: { callAttempts: 3 },
        actions: [
          { action: AutomationAction.SEND_SMS, params: { templateType: 'no_answer' } },
          { action: AutomationAction.SCHEDULE_FOLLOW_UP, params: { 
            delayMinutes: 2880, 
            message: 'Фінальна спроба після SMS (спроба 3)' 
          }}
        ],
        isActive: true,
        priority: 83,
      },
      {
        id: generateId(),
        name: 'No Answer #4 → Unreachable',
        description: 'Четвертий невдалий дзвінок: позначити як unreachable',
        trigger: AutomationTrigger.CALL_MISSED,
        triggerConditions: { callAttempts: 4 },
        actions: [
          { action: AutomationAction.SEND_NOTIFICATION, params: { 
            notificationType: NotificationType.SYSTEM, 
            title: 'Лід unreachable', 
            message: 'Лід {{firstName}} {{lastName}} переведено в статус unreachable після 4 спроб' 
          }}
        ],
        isActive: true,
        priority: 82,
      },

      // === SLA & Escalation ===
      {
        id: generateId(),
        name: 'Прострочена задача → Ескалація',
        description: 'При простроченій задачі ескалювати адміну',
        trigger: AutomationTrigger.TASK_OVERDUE,
        actions: [
          { action: AutomationAction.ESCALATE_TO_ADMIN, params: {} },
          { action: AutomationAction.SEND_NOTIFICATION, params: { 
            notificationType: NotificationType.TASK_OVERDUE, 
            title: 'Прострочена задача!', 
            message: 'Задача "{{title}}" прострочена!' 
          }}
        ],
        isActive: true,
        priority: 90,
      },
      {
        id: generateId(),
        name: 'Лід без активності 24г → Нагадування',
        description: 'Якщо лід не контактував 24 години - нагадати менеджеру',
        trigger: AutomationTrigger.NO_RESPONSE_24H,
        actions: [
          { action: AutomationAction.SEND_NOTIFICATION, params: { 
            notificationType: NotificationType.SYSTEM, 
            title: 'Нагадування', 
            message: 'Лід {{firstName}} {{lastName}} не контактував більше 24 годин' 
          }},
          { action: AutomationAction.SCHEDULE_CALLBACK, params: { delayMinutes: 30 } }
        ],
        isActive: true,
        priority: 70,
      },
      {
        id: generateId(),
        name: 'Лід без активності 48г → Ескалація',
        description: 'Якщо лід не контактував 48 годин - ескалація',
        trigger: AutomationTrigger.NO_RESPONSE_48H,
        actions: [
          { action: AutomationAction.ESCALATE_TO_ADMIN, params: {} },
          { action: AutomationAction.SEND_NOTIFICATION, params: { 
            notificationType: NotificationType.SYSTEM, 
            title: 'Критично: немає контакту', 
            message: 'Лід {{firstName}} {{lastName}} не контактував більше 48 годин!' 
          }}
        ],
        isActive: true,
        priority: 75,
      },

      // === Deposits ===
      {
        id: generateId(),
        name: 'Депозит отримано → Повідомлення',
        description: 'При отриманні депозиту повідомити менеджера та фінанси',
        trigger: AutomationTrigger.DEPOSIT_RECEIVED,
        actions: [
          { action: AutomationAction.SEND_NOTIFICATION, params: { 
            notificationType: NotificationType.DEPOSIT_RECEIVED, 
            title: 'Депозит отримано!', 
            message: 'Клієнт вніс депозит: {{amount}} USD' 
          }}
        ],
        isActive: true,
        priority: 95,
      },

      // === Documents ===
      {
        id: generateId(),
        name: 'Документ на верифікації → Нотифікація',
        description: 'При завантаженні документа сповістити відповідальних',
        trigger: AutomationTrigger.LEAD_STATUS_CHANGED,
        triggerConditions: { hasDocuments: true },
        actions: [
          { action: AutomationAction.SEND_NOTIFICATION, params: { 
            notificationType: NotificationType.SYSTEM, 
            title: 'Новий документ', 
            message: 'Завантажено документ для перевірки' 
          }}
        ],
        isActive: true,
        priority: 60,
      },
    ];

    await this.automationRuleModel.insertMany(rules);
    this.logger.log(`✓ Created ${rules.length} automation rules`);
    return rules.length;
  }

  // ==================== ROUTING RULES ====================

  async seedRoutingRules(): Promise<number> {
    const existingRules = await this.settingsModel.findOne({ key: 'routing_rules' });
    if (existingRules) {
      this.logger.log('✓ Routing rules already exist');
      return 0;
    }

    // Get managers for routing
    const managers = await this.userModel.find({ 
      role: { $in: [UserRole.MANAGER] }, 
      isActive: true 
    });

    const managerIds = managers.map(m => m.id);

    const routingRules = {
      id: generateId(),
      key: 'routing_rules',
      description: 'Lead routing configuration',
      value: {
        defaultStrategy: 'least_loaded',
        rules: [
          {
            id: generateId(),
            name: 'Default Routing - Least Loaded',
            description: 'Розподіл по найменш завантаженому менеджеру',
            conditions: {},
            strategy: 'least_loaded',
            assignees: managerIds,
            priority: 1,
            isActive: true,
          },
          {
            id: generateId(),
            name: 'VIP Leads - Senior Manager',
            description: 'VIP ліди призначаються старшому менеджеру',
            conditions: { source: ['referral', 'partner'], value: { $gte: 5000 } },
            strategy: 'manual',
            assignees: managerIds.slice(0, 1),
            priority: 100,
            isActive: true,
          },
          {
            id: generateId(),
            name: 'Website Leads - Round Robin',
            description: 'Ліди з сайту рівномірно розподіляються',
            conditions: { source: ['website', 'landing'] },
            strategy: 'round_robin',
            assignees: managerIds,
            priority: 50,
            isActive: true,
          },
          {
            id: generateId(),
            name: 'Phone Leads - First Available',
            description: 'Телефонні ліди до першого вільного',
            conditions: { source: ['phone', 'callback'] },
            strategy: 'least_loaded',
            assignees: managerIds,
            priority: 80,
            isActive: true,
          },
        ],
        fallbackAssignee: managerIds[0] || null,
        maxLeadsPerManager: 50,
        reassignOnOverload: true,
      },
    };

    await this.settingsModel.create(routingRules);
    this.logger.log('✓ Created routing rules');
    return 1;
  }

  // ==================== MESSAGE TEMPLATES ====================

  async seedMessageTemplates(): Promise<number> {
    const existingTemplates = await this.messageTemplateModel.countDocuments();
    if (existingTemplates > 0) {
      this.logger.log(`✓ Message templates already exist (${existingTemplates})`);
      return 0;
    }

    const templates = [
      // === Email Templates ===
      {
        id: generateId(),
        name: 'Новий лід - Internal',
        description: 'Внутрішнє повідомлення про нового ліда',
        channel: CommunicationChannel.EMAIL,
        type: 'new_lead',
        subject: 'Новий лід: {{firstName}} {{lastName}}',
        content: `<div style="font-family: 'IBM Plex Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #18181B; margin-bottom: 20px;">Новий лід в системі</h2>
          <div style="background: #F4F4F5; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <p style="margin: 8px 0;"><strong>Ім'я:</strong> {{firstName}} {{lastName}}</p>
            <p style="margin: 8px 0;"><strong>Email:</strong> {{email}}</p>
            <p style="margin: 8px 0;"><strong>Телефон:</strong> {{phone}}</p>
            <p style="margin: 8px 0;"><strong>Джерело:</strong> {{source}}</p>
          </div>
          <p style="color: #71717A; font-size: 14px;">Зателефонуйте клієнту протягом 10 хвилин для найкращого результату.</p>
        </div>`,
        isActive: true,
      },
      {
        id: generateId(),
        name: 'Нагадування про задачу',
        description: 'Нагадування про дедлайн задачі',
        channel: CommunicationChannel.EMAIL,
        type: 'task_reminder',
        subject: 'Нагадування: {{taskTitle}}',
        content: `<div style="font-family: 'IBM Plex Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #DC2626; margin-bottom: 20px;">⏰ Нагадування про задачу</h2>
          <div style="background: #FEF2F2; padding: 20px; border-radius: 12px; border-left: 4px solid #DC2626;">
            <p style="margin: 8px 0; font-size: 18px;"><strong>{{taskTitle}}</strong></p>
            <p style="margin: 8px 0; color: #71717A;">{{taskDescription}}</p>
            <p style="margin: 16px 0 0; color: #DC2626;"><strong>Термін:</strong> {{dueDate}}</p>
          </div>
        </div>`,
        isActive: true,
      },
      {
        id: generateId(),
        name: 'Депозит отримано',
        description: 'Повідомлення про отримання депозиту',
        channel: CommunicationChannel.EMAIL,
        type: 'deposit_alert',
        subject: '💰 Депозит отримано: {{amount}} USD',
        content: `<div style="font-family: 'IBM Plex Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #059669; margin-bottom: 20px;">Депозит підтверджено</h2>
          <div style="background: #ECFDF5; padding: 20px; border-radius: 12px; border-left: 4px solid #059669;">
            <p style="margin: 8px 0;"><strong>Клієнт:</strong> {{customerName}}</p>
            <p style="margin: 8px 0; font-size: 24px; color: #059669;"><strong>{{amount}} USD</strong></p>
            <p style="margin: 8px 0;"><strong>Угода:</strong> {{dealTitle}}</p>
          </div>
        </div>`,
        isActive: true,
      },

      // === SMS Templates (Multilingual) ===
      {
        id: generateId(),
        name: 'Welcome SMS',
        description: 'Привітання для нового ліда',
        channel: CommunicationChannel.SMS,
        type: 'welcome',
        subject: 'Welcome',
        content: 'Дякуємо за звернення до BIBI Cars! Наш менеджер {{managerName}} зв\'яжеться з вами найближчим часом. Тел: {{managerPhone}}',
        contentLocalized: {
          uk: 'Дякуємо за звернення до BIBI Cars! Наш менеджер {{managerName}} зв\'яжеться з вами найближчим часом. Тел: {{managerPhone}}',
          en: 'Thank you for contacting BIBI Cars! Our manager {{managerName}} will reach you shortly. Phone: {{managerPhone}}',
          bg: 'Благодарим ви, че се свързахте с BIBI Cars! Нашият мениджър {{managerName}} ще се свърже с вас скоро. Тел: {{managerPhone}}',
        },
        isActive: true,
      },
      {
        id: generateId(),
        name: 'Follow-up SMS',
        description: 'SMS для follow-up',
        channel: CommunicationChannel.SMS,
        type: 'follow_up',
        subject: 'Follow-up',
        content: 'Доброго дня, {{firstName}}! Це {{managerName}} з BIBI Cars. Нагадую про нашу розмову. Зателефонуйте: {{managerPhone}}',
        contentLocalized: {
          uk: 'Доброго дня, {{firstName}}! Це {{managerName}} з BIBI Cars. Нагадую про нашу розмову. Зателефонуйте: {{managerPhone}}',
          en: 'Hello {{firstName}}! This is {{managerName}} from BIBI Cars. Following up on our conversation. Please call: {{managerPhone}}',
          bg: 'Здравейте {{firstName}}! Това е {{managerName}} от BIBI Cars. Напомняме за нашия разговор. Обадете се: {{managerPhone}}',
        },
        isActive: true,
      },
      {
        id: generateId(),
        name: 'No Answer SMS',
        description: 'SMS після невдалих дзвінків',
        channel: CommunicationChannel.SMS,
        type: 'no_answer',
        subject: 'No Answer',
        content: 'Доброго дня, {{firstName}}! Ми намагалися зв\'язатися з вами. Зателефонуйте: {{managerPhone}} або напишіть нам.',
        contentLocalized: {
          uk: 'Доброго дня, {{firstName}}! Ми намагалися зв\'язатися з вами. Зателефонуйте: {{managerPhone}} або напишіть нам.',
          en: 'Hello {{firstName}}! We tried to reach you. Please call us: {{managerPhone}} or send us a message.',
          bg: 'Здравейте {{firstName}}! Опитахме се да се свържем с вас. Обадете се: {{managerPhone}} или ни пишете.',
        },
        isActive: true,
      },
      {
        id: generateId(),
        name: 'Callback Reminder SMS',
        description: 'Нагадування про зворотний дзвінок',
        channel: CommunicationChannel.SMS,
        type: 'callback',
        subject: 'Callback',
        content: 'Доброго дня! Ви залишали заявку на BIBI Cars. Наш менеджер зателефонує вам сьогодні. Дякуємо!',
        contentLocalized: {
          uk: 'Доброго дня! Ви залишали заявку на BIBI Cars. Наш менеджер зателефонує вам сьогодні. Дякуємо!',
          en: 'Hello! You left a request at BIBI Cars. Our manager will call you today. Thank you!',
          bg: 'Здравейте! Оставихте заявка в BIBI Cars. Нашият мениджър ще ви се обади днес. Благодарим!',
        },
        isActive: true,
      },
      {
        id: generateId(),
        name: 'Deposit Confirmation SMS',
        description: 'Підтвердження депозиту клієнту',
        channel: CommunicationChannel.SMS,
        type: 'deposit_confirm',
        subject: 'Deposit',
        content: 'Дякуємо! Ваш депозит {{amount}} USD отримано. Менеджер {{managerName}} зв\'яжеться з вами для підтвердження. BIBI Cars',
        contentLocalized: {
          uk: 'Дякуємо! Ваш депозит {{amount}} USD отримано. Менеджер {{managerName}} зв\'яжеться з вами. BIBI Cars',
          en: 'Thank you! Your deposit of {{amount}} USD received. Manager {{managerName}} will contact you. BIBI Cars',
          bg: 'Благодарим! Вашият депозит от {{amount}} USD е получен. Мениджър {{managerName}} ще се свърже с вас. BIBI Cars',
        },
        isActive: true,
      },
    ];

    await this.messageTemplateModel.insertMany(templates);
    this.logger.log(`✓ Created ${templates.length} message templates`);
    return templates.length;
  }

  // ==================== SETTINGS ====================

  async seedSettings(): Promise<number> {
    let count = 0;

    // System Settings
    const systemSettings = await this.settingsModel.findOne({ key: 'system_settings' });
    if (!systemSettings) {
      await this.settingsModel.create({
        id: generateId(),
        key: 'system_settings',
        description: 'Main system settings',
        value: {
          companyName: 'BIBI Cars',
          defaultLanguage: 'uk',
          supportedLanguages: ['uk', 'en', 'bg'],
          timezone: 'Europe/Sofia',
          currency: 'USD',
          workingHours: {
            start: '09:00',
            end: '18:00',
            timezone: 'Europe/Sofia',
            workDays: [1, 2, 3, 4, 5], // Mon-Fri
          },
          notifications: {
            emailEnabled: true,
            smsEnabled: true,
            pushEnabled: false,
          },
          branding: {
            primaryColor: '#18181B',
            accentColor: '#4F46E5',
          },
        },
      });
      count++;
    }

    // Lead Statuses
    const leadStatuses = await this.settingsModel.findOne({ key: 'lead_statuses' });
    if (!leadStatuses) {
      await this.settingsModel.create({
        id: generateId(),
        key: 'lead_statuses',
        description: 'Available lead statuses',
        value: Object.values(LeadStatus),
      });
      count++;
    }

    // Lead Sources
    const leadSources = await this.settingsModel.findOne({ key: 'lead_sources' });
    if (!leadSources) {
      await this.settingsModel.create({
        id: generateId(),
        key: 'lead_sources',
        description: 'Available lead sources',
        value: Object.values(LeadSource),
      });
      count++;
    }

    // Deal Statuses
    const dealStatuses = await this.settingsModel.findOne({ key: 'deal_statuses' });
    if (!dealStatuses) {
      await this.settingsModel.create({
        id: generateId(),
        key: 'deal_statuses',
        description: 'Available deal statuses',
        value: ['new', 'negotiation', 'proposal', 'contract', 'won', 'lost'],
      });
      count++;
    }

    // Deposit Statuses
    const depositStatuses = await this.settingsModel.findOne({ key: 'deposit_statuses' });
    if (!depositStatuses) {
      await this.settingsModel.create({
        id: generateId(),
        key: 'deposit_statuses',
        description: 'Available deposit statuses',
        value: ['pending', 'confirmed', 'completed', 'refunded', 'cancelled'],
      });
      count++;
    }

    // Document Types
    const documentTypes = await this.settingsModel.findOne({ key: 'document_types' });
    if (!documentTypes) {
      await this.settingsModel.create({
        id: generateId(),
        key: 'document_types',
        description: 'Available document types',
        value: ['contract', 'invoice', 'deposit_proof', 'client_document', 'delivery_document', 'custom'],
      });
      count++;
    }

    if (count > 0) {
      this.logger.log(`✓ Created ${count} settings`);
    }
    return count;
  }

  // ==================== SLA SETTINGS ====================

  async seedSlaSettings(): Promise<number> {
    const existingSla = await this.settingsModel.findOne({ key: 'sla_config' });
    if (existingSla) {
      this.logger.log('✓ SLA settings already exist');
      return 0;
    }

    await this.settingsModel.create({
      id: generateId(),
      key: 'sla_config',
      description: 'SLA configuration for call center operations',
      value: {
        callback: {
          firstResponseMinutes: 5,
          followUpMinutes: 15,
          escalation1Minutes: 30,
          escalation2Minutes: 60,
          maxAttempts: 4,
        },
        lead: {
          firstResponseMinutes: 10,
          noActivityWarningHours: 24,
          staleHours: 48,
        },
        manager: {
          inactiveMinutes: 120,
          maxActiveLeads: 50,
        },
        escalation: {
          level1Actions: ['notify_manager'],
          level2Actions: ['notify_manager', 'notify_admin', 'create_task'],
          level3Actions: ['notify_manager', 'notify_admin', 'alert_master', 'create_task'],
        },
        cron: {
          callbackCheckMinutes: 5,
          leadCheckMinutes: 10,
          aggregationHours: 1,
          dailySummaryHour: 9,
        },
      },
    });

    this.logger.log('✓ Created SLA settings');
    return 1;
  }

  // ==================== TEST DATA ====================

  async seedTestLeads(count: number = 10): Promise<number> {
    const sources = Object.values(LeadSource);
    const statuses = Object.values(LeadStatus);
    const contactStatuses = Object.values(ContactStatus);
    
    const managers = await this.userModel.find({ 
      role: { $in: [UserRole.MANAGER] }, 
      isActive: true 
    });

    const leads: any[] = [];
    for (let i = 0; i < count; i++) {
      leads.push({
        id: generateId(),
        firstName: `Test${i + 1}`,
        lastName: `Lead${i + 1}`,
        email: `test.lead${i + 1}@example.com`,
        phone: `+359888${100000 + i}`,
        company: i % 2 === 0 ? `Company ${i + 1}` : undefined,
        status: statuses[i % statuses.length],
        contactStatus: contactStatuses[i % contactStatuses.length],
        source: sources[i % sources.length],
        value: Math.floor(Math.random() * 10000),
        callAttempts: i % 4,
        escalationLevel: i % 4,
        assignedTo: managers.length > 0 ? managers[i % managers.length].id : undefined,
        isDeleted: false,
      });
    }

    await this.leadModel.insertMany(leads);
    this.logger.log(`✓ Created ${leads.length} test leads`);
    return leads.length;
  }

  async clearTestData(): Promise<void> {
    await this.leadModel.deleteMany({ email: { $regex: /^test\.lead/ } });
    this.logger.log('✓ Cleared test data');
  }
}
