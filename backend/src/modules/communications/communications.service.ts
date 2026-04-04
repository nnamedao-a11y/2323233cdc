import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { CommunicationLog } from './schemas/communication-log.schema';
import { MessageTemplate } from './schemas/message-template.schema';
import { CommunicationChannel } from '../../shared/enums';
import { generateId, toObjectResponse, toArrayResponse } from '../../shared/utils';

interface SendMessageDto {
  channel: CommunicationChannel;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  templateId?: string;
  subject?: string;
  content?: string;
  variables?: Record<string, any>;
  sentBy: string;
}

@Injectable()
export class CommunicationsService implements OnModuleInit {
  private readonly logger = new Logger(CommunicationsService.name);
  private resendApiKey: string;
  private senderEmail: string;

  constructor(
    @InjectModel(CommunicationLog.name) private logModel: Model<CommunicationLog>,
    @InjectModel(MessageTemplate.name) private templateModel: Model<MessageTemplate>,
    @InjectQueue('communications') private communicationsQueue: Queue,
    private configService: ConfigService,
  ) {
    this.resendApiKey = this.configService.get('RESEND_API_KEY') || '';
    this.senderEmail = this.configService.get('SENDER_EMAIL') || 'noreply@autocrm.com';
  }

  async onModuleInit() {
    await this.bootstrapDefaultTemplates();
  }

  // Надіслати повідомлення
  async sendMessage(dto: SendMessageDto): Promise<any> {
    let subject = dto.subject || '';
    let content = dto.content || '';

    // Якщо є шаблон, використати його
    if (dto.templateId) {
      const template = await this.templateModel.findOne({ id: dto.templateId, isActive: true });
      if (template) {
        subject = this.interpolate(template.subject, dto.variables || {});
        content = this.interpolate(template.content, dto.variables || {});
      }
    } else if (dto.variables) {
      subject = this.interpolate(subject, dto.variables);
      content = this.interpolate(content, dto.variables);
    }

    // Створюємо запис
    const log = new this.logModel({
      id: generateId(),
      channel: dto.channel,
      recipientId: dto.recipientId,
      recipientEmail: dto.recipientEmail,
      recipientPhone: dto.recipientPhone,
      subject,
      content,
      templateId: dto.templateId,
      status: 'pending',
      sentBy: dto.sentBy,
    });

    const saved = await log.save();

    // Додаємо в чергу на відправку
    await this.communicationsQueue.add('send', {
      logId: saved.id,
      channel: dto.channel,
      recipient: dto.channel === CommunicationChannel.EMAIL ? dto.recipientEmail : dto.recipientPhone,
      subject,
      content,
    });

    return toObjectResponse(saved);
  }

  // Відправка email через Resend
  async sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.resendApiKey) {
      this.logger.warn('RESEND_API_KEY not configured, skipping email');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.senderEmail,
          to: [to],
          subject,
          html,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Email send failed');
      }

      return { success: true, id: data.id };
    } catch (error) {
      this.logger.error(`Email send error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Оновити статус повідомлення
  async updateStatus(logId: string, status: string, externalId?: string, errorMessage?: string): Promise<void> {
    const updateData: any = { status };
    if (externalId) updateData.externalId = externalId;
    if (errorMessage) updateData.errorMessage = errorMessage;
    if (status === 'sent') updateData.sentAt = new Date();
    if (status === 'delivered') updateData.deliveredAt = new Date();

    await this.logModel.findOneAndUpdate({ id: logId }, { $set: updateData });
  }

  // Історія комунікацій
  async getHistory(recipientId: string, channel?: CommunicationChannel): Promise<any[]> {
    const filter: any = { recipientId };
    if (channel) filter.channel = channel;

    const logs = await this.logModel.find(filter).sort({ createdAt: -1 }).limit(100);
    return toArrayResponse(logs);
  }

  // CRUD для шаблонів
  async createTemplate(data: Partial<MessageTemplate>): Promise<any> {
    const template = new this.templateModel({
      id: generateId(),
      ...data,
      variables: this.extractVariables(data.content || ''),
    });
    return toObjectResponse(await template.save());
  }

  async findAllTemplates(channel?: CommunicationChannel): Promise<any[]> {
    const filter: any = { isActive: true };
    if (channel) filter.channel = channel;
    const templates = await this.templateModel.find(filter).sort({ createdAt: -1 });
    return toArrayResponse(templates);
  }

  async updateTemplate(id: string, data: Partial<MessageTemplate>): Promise<any> {
    if (data.content) {
      data.variables = this.extractVariables(data.content);
    }
    const template = await this.templateModel.findOneAndUpdate(
      { id },
      { $set: data },
      { new: true }
    );
    return template ? toObjectResponse(template) : null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await this.templateModel.findOneAndUpdate(
      { id },
      { $set: { isActive: false } }
    );
    return !!result;
  }

  async findTemplateByType(type: string, channel: CommunicationChannel): Promise<any> {
    const template = await this.templateModel.findOne({ type, channel, isActive: true });
    return template ? toObjectResponse(template) : null;
  }

  // Helpers
  private interpolate(template: string, data: Record<string, any>): string {
    if (!template) return '';
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key]?.toString() || '');
  }

  private extractVariables(content: string): string[] {
    const matches = content.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  }

  // Дефолтні шаблони
  private async bootstrapDefaultTemplates(): Promise<void> {
    const count = await this.templateModel.countDocuments();
    if (count > 0) return;

    const defaultTemplates = [
      {
        name: 'Новий лід',
        description: 'Нотифікація менеджеру про нового ліда',
        channel: CommunicationChannel.EMAIL,
        type: 'new_lead',
        subject: 'Новий лід: {{firstName}} {{lastName}}',
        content: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0A0A0B;">Новий лід в системі</h2>
            <p>Ім'я: <strong>{{firstName}} {{lastName}}</strong></p>
            <p>Email: {{email}}</p>
            <p>Телефон: {{phone}}</p>
            <p>Джерело: {{source}}</p>
            <hr style="border: 1px solid #E4E4E7; margin: 20px 0;">
            <p style="color: #71717A; font-size: 14px;">
              Зателефонуйте клієнту протягом 10 хвилин для найкращого результату.
            </p>
          </div>
        `,
      },
      {
        name: 'Нагадування про задачу',
        description: 'Нагадування про прострочену або наближену задачу',
        channel: CommunicationChannel.EMAIL,
        type: 'task_reminder',
        subject: 'Нагадування: {{taskTitle}}',
        content: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #DC2626;">Нагадування про задачу</h2>
            <p><strong>{{taskTitle}}</strong></p>
            <p>{{taskDescription}}</p>
            <p>Термін: {{dueDate}}</p>
            <hr style="border: 1px solid #E4E4E7; margin: 20px 0;">
            <p style="color: #71717A; font-size: 14px;">AutoCRM</p>
          </div>
        `,
      },
      {
        name: 'Депозит отримано',
        description: 'Повідомлення про отримання депозиту',
        channel: CommunicationChannel.EMAIL,
        type: 'deposit_alert',
        subject: 'Депозит отримано: {{amount}} USD',
        content: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16A34A;">Депозит підтверджено</h2>
            <p>Клієнт: <strong>{{customerName}}</strong></p>
            <p>Сума: <strong>{{amount}} USD</strong></p>
            <p>Угода: {{dealTitle}}</p>
            <hr style="border: 1px solid #E4E4E7; margin: 20px 0;">
            <p style="color: #71717A; font-size: 14px;">AutoCRM</p>
          </div>
        `,
      },
      // === SMS Templates (Bulgarian market optimized) ===
      {
        name: 'Follow-up SMS (UA)',
        description: 'SMS нагадування для follow-up - українська',
        channel: CommunicationChannel.SMS,
        type: 'follow_up',
        subject: 'Follow-up',
        content: 'Доброго дня, {{firstName}}! Це {{managerName}} з AutoCRM. Нагадую про нашу розмову. Зателефонуйте, будь ласка: {{managerPhone}}',
        contentLocalized: {
          uk: 'Доброго дня, {{firstName}}! Це {{managerName}} з AutoCRM. Нагадую про нашу розмову. Зателефонуйте, будь ласка: {{managerPhone}}',
          en: 'Hello {{firstName}}! This is {{managerName}} from AutoCRM. Following up on our conversation. Please call: {{managerPhone}}',
          bg: 'Здравейте {{firstName}}! Това е {{managerName}} от AutoCRM. Напомняме за нашия разговор. Моля, обадете се: {{managerPhone}}',
        },
      },
      {
        name: 'No Answer SMS',
        description: 'SMS після невдалих спроб дзвінка',
        channel: CommunicationChannel.SMS,
        type: 'no_answer',
        subject: 'No Answer',
        content: 'Доброго дня, {{firstName}}! Ми намагалися зв\'язатися з вами. Зателефонуйте нам: {{managerPhone}} або напишіть на email.',
        contentLocalized: {
          uk: 'Доброго дня, {{firstName}}! Ми намагалися зв\'язатися з вами. Зателефонуйте нам: {{managerPhone}} або напишіть на email.',
          en: 'Hello {{firstName}}! We tried to reach you. Please call us: {{managerPhone}} or send an email.',
          bg: 'Здравейте {{firstName}}! Опитахме се да се свържем с вас. Моля, обадете се: {{managerPhone}} или ни пишете на email.',
        },
      },
      {
        name: 'Callback Reminder SMS',
        description: 'SMS нагадування про зворотний дзвінок',
        channel: CommunicationChannel.SMS,
        type: 'callback',
        subject: 'Callback',
        content: 'Доброго дня! Залишили заявку на {{companyName}}? Ми зателефонуємо вам сьогодні. Дякуємо!',
        contentLocalized: {
          uk: 'Доброго дня! Залишили заявку на {{companyName}}? Ми зателефонуємо вам сьогодні. Дякуємо!',
          en: 'Hello! Left a request at {{companyName}}? We will call you today. Thank you!',
          bg: 'Здравейте! Оставихте заявка в {{companyName}}? Ще ви се обадим днес. Благодарим!',
        },
      },
      {
        name: 'Welcome SMS',
        description: 'SMS привітання для нового ліда',
        channel: CommunicationChannel.SMS,
        type: 'welcome',
        subject: 'Welcome',
        content: 'Дякуємо за звернення до {{companyName}}! Наш менеджер зв\'яжеться з вами найближчим часом.',
        contentLocalized: {
          uk: 'Дякуємо за звернення до {{companyName}}! Наш менеджер зв\'яжеться з вами найближчим часом.',
          en: 'Thank you for contacting {{companyName}}! Our manager will reach you shortly.',
          bg: 'Благодарим ви, че се свързахте с {{companyName}}! Нашият мениджър ще се свърже с вас скоро.',
        },
      },
    ];

    for (const template of defaultTemplates) {
      await this.createTemplate(template);
    }

    this.logger.log(`Created ${defaultTemplates.length} default message templates`);
  }
}
