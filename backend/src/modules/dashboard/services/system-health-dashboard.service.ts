import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from '../../communications/schemas/message.schema';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { SystemHealthDashboardMetrics } from '../interfaces/dashboard-response.interface';
import { CommunicationChannel } from '../../../shared/enums';

@Injectable()
export class SystemHealthDashboardService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
  ) {}

  async getMetrics(query: DashboardQueryDto): Promise<SystemHealthDashboardMetrics> {
    const periodStart = this.getPeriodStart(query.period);

    const [
      smsFailures,
      emailFailures,
      webhookFailures,
      queueBacklog,
    ] = await Promise.all([
      // SMS failures
      this.messageModel.countDocuments({
        channel: CommunicationChannel.SMS,
        status: 'failed',
        createdAt: { $gte: periodStart },
      }),

      // Email failures
      this.messageModel.countDocuments({
        channel: CommunicationChannel.EMAIL,
        status: 'failed',
        createdAt: { $gte: periodStart },
      }),

      // Webhook failures (messages with undelivered status from provider)
      this.messageModel.countDocuments({
        status: 'undelivered',
        createdAt: { $gte: periodStart },
      }),

      // Queue backlog (messages with pending or queued status)
      this.messageModel.countDocuments({
        status: { $in: ['pending', 'queued'] },
      }),
    ]);

    // Calculate total failed jobs
    const failedJobs = smsFailures + emailFailures;

    // Determine system status
    const systemStatus = this.calculateSystemStatus(failedJobs, queueBacklog);

    return {
      failedJobs,
      queueBacklog,
      smsFailures,
      emailFailures,
      webhookFailures,
      systemStatus,
    };
  }

  private calculateSystemStatus(
    failedJobs: number,
    queueBacklog: number,
  ): 'healthy' | 'warning' | 'critical' {
    // Critical: many failures or huge backlog
    if (failedJobs > 50 || queueBacklog > 100) {
      return 'critical';
    }
    // Warning: some issues
    if (failedJobs > 10 || queueBacklog > 30) {
      return 'warning';
    }
    return 'healthy';
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
