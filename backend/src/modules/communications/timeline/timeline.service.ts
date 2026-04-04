import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommunicationEvent, CommunicationEventType } from '../schemas/communication-event.schema';
import { Lead } from '../../leads/lead.schema';
import { generateId, toObjectResponse, toArrayResponse } from '../../../shared/utils';

/**
 * Timeline Service - Управління історією комунікацій
 * Відповідає за:
 * - Додавання подій до timeline
 * - Оновлення contact tracking на lead/customer
 * - Розрахунок escalation level
 */

interface AddEventDto {
  customerId?: string;
  leadId?: string;
  type: CommunicationEventType;
  channel: 'call' | 'sms' | 'email' | 'viber' | 'system';
  messageId?: string;
  title: string;
  description?: string;
  meta?: Record<string, any>;
  initiatedBy?: string;
  isAutomated?: boolean;
}

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(
    @InjectModel(CommunicationEvent.name) private eventModel: Model<CommunicationEvent>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
  ) {}

  /**
   * Додати подію до timeline
   */
  async addEvent(dto: AddEventDto): Promise<any> {
    const event = new this.eventModel({
      id: generateId(),
      customerId: dto.customerId || dto.leadId, // fallback to leadId
      leadId: dto.leadId,
      type: dto.type,
      channel: dto.channel,
      messageId: dto.messageId,
      title: dto.title,
      description: dto.description,
      meta: dto.meta,
      initiatedBy: dto.initiatedBy || 'system',
      isAutomated: dto.isAutomated ?? false,
    });

    const saved = await event.save();
    this.logger.log(`Timeline event added: ${dto.type} for ${dto.leadId || dto.customerId}`);

    // Оновити contact tracking на lead
    if (dto.leadId) {
      await this.updateLeadContactTracking(dto.leadId, dto.type, dto.channel);
    }

    return toObjectResponse(saved);
  }

  /**
   * Отримати timeline для клієнта/ліда
   */
  async getTimeline(
    entityId: string, 
    entityType: 'lead' | 'customer' = 'lead',
    limit: number = 50
  ): Promise<any[]> {
    const filter = entityType === 'lead' 
      ? { leadId: entityId }
      : { customerId: entityId };

    const events = await this.eventModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit);

    return toArrayResponse(events);
  }

  /**
   * Отримати статистику комунікацій
   */
  async getStats(leadId: string): Promise<{
    totalCalls: number;
    totalSms: number;
    totalEmails: number;
    deliveredSms: number;
    failedSms: number;
    lastContact: Date | null;
    escalationLevel: number;
  }> {
    const lead = await this.leadModel.findOne({ id: leadId });
    
    const stats = await this.eventModel.aggregate([
      { $match: { leadId } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsMap = stats.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalCalls: (statsMap['call_attempt'] || 0) + (statsMap['call_completed'] || 0) + (statsMap['call_missed'] || 0),
      totalSms: statsMap['sms_sent'] || 0,
      totalEmails: statsMap['email_sent'] || 0,
      deliveredSms: statsMap['sms_delivered'] || 0,
      failedSms: (statsMap['sms_failed'] || 0) + (statsMap['sms_undelivered'] || 0),
      lastContact: lead?.lastContactAt || null,
      escalationLevel: lead?.escalationLevel || 0,
    };
  }

  /**
   * Оновити contact tracking на lead
   */
  private async updateLeadContactTracking(
    leadId: string,
    eventType: CommunicationEventType,
    channel: string
  ): Promise<void> {
    const updateData: any = {
      lastContactAt: new Date(),
    };

    // Оновлення лічильників
    if (channel === 'call') {
      if (eventType === 'call_attempt' || eventType === 'call_missed') {
        updateData.$inc = { callAttempts: 1 };
      }
    } else if (channel === 'sms') {
      if (eventType === 'sms_sent') {
        updateData.$inc = { ...updateData.$inc, smsAttempts: 1 };
      }
      if (eventType === 'sms_delivered') {
        updateData.lastSmsDeliveredAt = new Date();
      }
    } else if (channel === 'email') {
      if (eventType === 'email_sent') {
        updateData.$inc = { ...updateData.$inc, emailAttempts: 1 };
      }
      if (eventType === 'email_delivered') {
        updateData.lastEmailDeliveredAt = new Date();
      }
    }

    // Оновлення escalation level
    const lead = await this.leadModel.findOne({ id: leadId });
    if (lead) {
      const newEscalationLevel = this.calculateEscalationLevel(
        lead.callAttempts + (updateData.$inc?.callAttempts || 0),
        lead.smsAttempts + (updateData.$inc?.smsAttempts || 0),
        eventType
      );
      
      if (newEscalationLevel > lead.escalationLevel) {
        updateData.escalationLevel = newEscalationLevel;
      }
    }

    // Apply $inc separately
    const incData = updateData.$inc;
    delete updateData.$inc;

    await this.leadModel.findOneAndUpdate(
      { id: leadId },
      { 
        $set: updateData,
        ...(incData && { $inc: incData })
      }
    );
  }

  /**
   * Розрахунок escalation level
   * 0 = new
   * 1 = 1st call attempt
   * 2 = 2+ call attempts
   * 3 = SMS sent
   * 4 = cold/unreachable (after failed SMS or 4+ attempts)
   */
  private calculateEscalationLevel(
    callAttempts: number,
    smsAttempts: number,
    lastEvent: CommunicationEventType
  ): number {
    if (lastEvent === 'sms_failed' || lastEvent === 'sms_undelivered') {
      return 4; // Cold/unreachable
    }

    if (smsAttempts > 0) {
      return 3; // SMS sent
    }

    if (callAttempts >= 2) {
      return 2; // Multiple attempts
    }

    if (callAttempts === 1) {
      return 1; // First attempt
    }

    return 0; // New
  }

  /**
   * Додати escalation event
   */
  async addEscalationEvent(
    leadId: string,
    fromLevel: number,
    toLevel: number,
    reason: string
  ): Promise<void> {
    await this.addEvent({
      leadId,
      type: 'escalation',
      channel: 'system',
      title: `Ескалація: рівень ${fromLevel} → ${toLevel}`,
      description: reason,
      meta: {
        previousLevel: fromLevel,
        newLevel: toLevel,
      },
      isAutomated: true,
    });
  }
}
