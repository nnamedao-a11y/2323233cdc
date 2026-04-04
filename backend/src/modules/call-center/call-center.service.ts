import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { CallLog } from './schemas/call-log.schema';
import { CallbackQueue } from './schemas/callback-queue.schema';
import { Lead } from '../leads/lead.schema';
import { AutomationService } from '../automation/automation.service';
import { ContactStatus, CallResult, AutomationTrigger, CommunicationChannel } from '../../shared/enums';
import { generateId, toObjectResponse, toArrayResponse } from '../../shared/utils';
import { PaginatedResult } from '../../shared/dto/pagination.dto';

@Injectable()
export class CallCenterService {
  private readonly logger = new Logger(CallCenterService.name);

  constructor(
    @InjectModel(CallLog.name) private callLogModel: Model<CallLog>,
    @InjectModel(CallbackQueue.name) private callbackModel: Model<CallbackQueue>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectQueue('callbacks') private callbackQueue: Queue,
    private automationService: AutomationService,
  ) {}

  // Записати результат дзвінка
  async logCall(data: {
    leadId: string;
    customerId?: string;
    managerId: string;
    channel?: CommunicationChannel;
    result: CallResult;
    duration?: number;
    notes?: string;
    nextFollowUpDate?: Date;
  }): Promise<any> {
    const callLog = new this.callLogModel({
      id: generateId(),
      ...data,
      channel: data.channel || CommunicationChannel.PHONE,
    });

    // Визначаємо новий contact status на основі результату
    const newContactStatus = this.mapCallResultToContactStatus(data.result);
    callLog.newContactStatus = newContactStatus;

    const saved = await callLog.save();

    // Оновлюємо lead з новим contact status
    const lead = await this.leadModel.findOne({ id: data.leadId });
    if (lead) {
      await this.leadModel.findOneAndUpdate(
        { id: data.leadId },
        { $set: { contactStatus: newContactStatus, lastContactAt: new Date() } }
      );

      // Тригеримо автоматизацію
      if (data.result === CallResult.NO_ANSWER || data.result === CallResult.BUSY) {
        await this.automationService.emit({
          trigger: AutomationTrigger.CALL_MISSED,
          entityType: 'lead',
          entityId: data.leadId,
          data: { ...lead.toObject(), callResult: data.result },
          userId: data.managerId,
        });
      }
    }

    // Якщо є наступний follow-up, створюємо callback
    if (data.nextFollowUpDate) {
      await this.scheduleCallback({
        leadId: data.leadId,
        customerId: data.customerId,
        assignedTo: data.managerId,
        scheduledAt: data.nextFollowUpDate,
        notes: `Follow-up після дзвінка: ${data.notes || ''}`,
      });
    }

    return toObjectResponse(saved);
  }

  private mapCallResultToContactStatus(result: CallResult): ContactStatus {
    const mapping: Record<CallResult, ContactStatus> = {
      [CallResult.ANSWERED]: ContactStatus.CONTACTED,
      [CallResult.NO_ANSWER]: ContactStatus.NO_ANSWER,
      [CallResult.BUSY]: ContactStatus.CALLBACK_SCHEDULED,
      [CallResult.VOICEMAIL]: ContactStatus.AWAITING_REPLY,
      [CallResult.WRONG_NUMBER]: ContactStatus.LOST_UNREACHABLE,
      [CallResult.CALLBACK_REQUESTED]: ContactStatus.CALLBACK_SCHEDULED,
      [CallResult.NOT_INTERESTED]: ContactStatus.LOST_UNREACHABLE,
      [CallResult.DEAL_DISCUSSED]: ContactStatus.CONTACTED,
    };
    return mapping[result] || ContactStatus.CONTACTED;
  }

  // Отримати історію дзвінків по ліду
  async getCallHistory(leadId: string): Promise<any[]> {
    const logs = await this.callLogModel
      .find({ leadId })
      .sort({ createdAt: -1 })
      .exec();
    return toArrayResponse(logs);
  }

  // Створити callback у чергу
  async scheduleCallback(data: {
    leadId: string;
    customerId?: string;
    assignedTo: string;
    scheduledAt: Date;
    notes?: string;
    priority?: number;
  }): Promise<any> {
    // Підраховуємо номер спроби
    const existingCallbacks = await this.callbackModel.countDocuments({ leadId: data.leadId });

    const callback = new this.callbackModel({
      id: generateId(),
      ...data,
      attemptNumber: existingCallbacks + 1,
      priority: data.priority || 1,
    });

    const saved = await callback.save();

    // Додаємо задачу в чергу для нагадування
    const delay = new Date(data.scheduledAt).getTime() - Date.now();
    if (delay > 0) {
      await this.callbackQueue.add('remind-callback', {
        callbackId: saved.id,
        assignedTo: data.assignedTo,
      }, { delay });
    }

    return toObjectResponse(saved);
  }

  // Черга callbacks для менеджера
  async getCallbackQueue(managerId: string, status?: string): Promise<any[]> {
    const filter: any = { assignedTo: managerId };
    if (status) filter.status = status;
    else filter.status = { $in: ['pending', 'in_progress'] };

    const callbacks = await this.callbackModel
      .find(filter)
      .sort({ priority: -1, scheduledAt: 1 })
      .exec();
    return toArrayResponse(callbacks);
  }

  // Позначити callback як виконаний
  async completeCallback(id: string, notes?: string): Promise<any> {
    const callback = await this.callbackModel.findOneAndUpdate(
      { id },
      { $set: { status: 'completed', completedAt: new Date(), notes } },
      { new: true }
    );
    return callback ? toObjectResponse(callback) : null;
  }

  // Статистика call center
  async getStats(managerId?: string, startDate?: Date, endDate?: Date): Promise<any> {
    const filter: any = {};
    if (managerId) filter.managerId = managerId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate;
      if (endDate) filter.createdAt.$lte = endDate;
    }

    const [totalCalls, byResult, avgDuration, pendingCallbacks] = await Promise.all([
      this.callLogModel.countDocuments(filter),
      this.callLogModel.aggregate([
        { $match: filter },
        { $group: { _id: '$result', count: { $sum: 1 } } },
      ]),
      this.callLogModel.aggregate([
        { $match: { ...filter, duration: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$duration' } } },
      ]),
      this.callbackModel.countDocuments({
        ...(managerId ? { assignedTo: managerId } : {}),
        status: 'pending',
      }),
    ]);

    return {
      totalCalls,
      pendingCallbacks,
      avgDuration: Math.round(avgDuration[0]?.avg || 0),
      byResult: byResult.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
    };
  }
}
