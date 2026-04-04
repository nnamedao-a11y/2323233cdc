import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../shared/enums';

@Processor('callbacks')
export class CallbackProcessor {
  private readonly logger = new Logger(CallbackProcessor.name);

  constructor(private notificationsService: NotificationsService) {}

  @Process('remind-callback')
  async handleCallbackReminder(job: Job<{ callbackId: string; assignedTo: string }>) {
    this.logger.log(`Callback reminder: ${job.data.callbackId}`);
    
    await this.notificationsService.create({
      userId: job.data.assignedTo,
      type: NotificationType.TASK_DUE,
      title: 'Callback нагадування',
      message: 'Час зателефонувати клієнту!',
      entityType: 'callback',
      entityId: job.data.callbackId,
    });
  }
}
