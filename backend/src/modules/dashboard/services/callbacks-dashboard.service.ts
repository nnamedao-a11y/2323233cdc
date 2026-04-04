import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../../leads/lead.schema';
import { Task } from '../../tasks/task.schema';
import { Message } from '../../communications/schemas/message.schema';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { CallbacksDashboardMetrics } from '../interfaces/dashboard-response.interface';
import { ContactStatus, CommunicationChannel } from '../../../shared/enums';

@Injectable()
export class CallbacksDashboardService {
  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
  ) {}

  async getMetrics(query: DashboardQueryDto): Promise<CallbacksDashboardMetrics> {
    const periodStart = this.getPeriodStart(query.period);
    const now = new Date();

    const baseLeadFilter: any = {
      isDeleted: { $ne: true },
      status: { $nin: ['won', 'lost', 'archived'] },
    };

    if (query.managerId) {
      baseLeadFilter.assignedTo = query.managerId;
    }

    const [
      missedCalls,
      noAnswerLeads,
      followUpsDue,
      smsTriggered,
      callbacksScheduled,
    ] = await Promise.all([
      // Missed calls - leads with missed_call contact status
      this.leadModel.countDocuments({
        ...baseLeadFilter,
        contactStatus: ContactStatus.MISSED_CALL,
      }),

      // No answer leads
      this.leadModel.countDocuments({
        ...baseLeadFilter,
        contactStatus: ContactStatus.NO_ANSWER,
      }),

      // Follow-ups due - leads with nextFollowUpAt in the past
      this.leadModel.countDocuments({
        ...baseLeadFilter,
        nextFollowUpAt: { $lt: now },
      }),

      // SMS triggered in period
      this.messageModel.countDocuments({
        channel: CommunicationChannel.SMS,
        direction: 'outbound',
        createdAt: { $gte: periodStart },
      }),

      // Callbacks scheduled (leads with callback_scheduled status)
      this.leadModel.countDocuments({
        ...baseLeadFilter,
        contactStatus: ContactStatus.CALLBACK_SCHEDULED,
      }),
    ]);

    return {
      missedCalls,
      noAnswerLeads,
      followUpsDue,
      smsTriggered,
      callbacksScheduled,
    };
  }

  private getPeriodStart(period: string = 'day'): Date {
    const now = new Date();
    switch (period) {
      case 'week':
        return new Date(now.setDate(now.getDate() - 7));
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1));
      default:
        return new Date(now.setHours(0, 0, 0, 0));
    }
  }
}
