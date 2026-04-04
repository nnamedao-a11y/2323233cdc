import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { CommunicationsService } from './communications.service';
import { SMSProviderManager } from './providers/sms-provider.manager';
import { TimelineService } from './timeline/timeline.service';
import { CommunicationChannel } from '../../shared/enums';

@Processor('communications')
export class CommunicationsProcessor {
  private readonly logger = new Logger(CommunicationsProcessor.name);

  constructor(
    private communicationsService: CommunicationsService,
    private smsProviderManager: SMSProviderManager,
    private timelineService: TimelineService,
  ) {}

  @Process('send')
  async handleSend(job: Job<{
    logId: string;
    channel: CommunicationChannel;
    recipient: string;
    subject: string;
    content: string;
    metadata?: {
      leadId?: string;
      customerId?: string;
      attemptNumber?: number;
    };
  }>) {
    const { logId, channel, recipient, subject, content, metadata } = job.data;
    this.logger.log(`Processing ${channel} message ${logId} to ${recipient}`);

    try {
      if (channel === CommunicationChannel.EMAIL) {
        const result = await this.communicationsService.sendEmail(recipient, subject, content);
        
        if (result.success) {
          await this.communicationsService.updateStatus(logId, 'sent', result.id);
          
          // Add to timeline
          if (metadata?.leadId) {
            await this.timelineService.addEvent({
              leadId: metadata.leadId,
              type: 'email_sent',
              channel: 'email',
              title: 'Email відправлено',
              meta: { email: recipient },
              isAutomated: true,
            });
          }
          
          this.logger.log(`Email sent successfully: ${logId}`);
        } else {
          await this.communicationsService.updateStatus(logId, 'failed', undefined, result.error);
          this.logger.error(`Email failed: ${logId} - ${result.error}`);
        }
      } else if (channel === CommunicationChannel.SMS) {
        // Use SMS Provider Manager with fallback support
        const result = await this.smsProviderManager.send({
          to: recipient,
          message: content,
          metadata: {
            leadId: metadata?.leadId,
            customerId: metadata?.customerId,
            attemptNumber: metadata?.attemptNumber,
          },
        });
        
        if (result.success) {
          await this.communicationsService.updateStatus(logId, 'sent', result.messageId);
          
          // Add to timeline (sent status - delivered will come via webhook)
          if (metadata?.leadId) {
            await this.timelineService.addEvent({
              leadId: metadata.leadId,
              type: 'sms_sent',
              channel: 'sms',
              title: 'SMS відправлено',
              description: `Очікується підтвердження доставки`,
              meta: { phone: recipient },
              isAutomated: true,
            });
          }
          
          this.logger.log(`SMS sent successfully via ${result.providerName}: ${logId}`);
        } else {
          await this.communicationsService.updateStatus(logId, 'failed', undefined, result.errorMessage);
          this.logger.error(`SMS failed: ${logId} - ${result.errorMessage}`);
        }
      } else if (channel === CommunicationChannel.VIBER) {
        // Future: Use Viber Business provider
        this.logger.warn(`Viber sending not yet implemented for ${logId}`);
        await this.communicationsService.updateStatus(logId, 'pending', undefined, 'Viber service not yet implemented');
      } else {
        this.logger.warn(`Unsupported channel ${channel} for ${logId}`);
        await this.communicationsService.updateStatus(logId, 'failed', undefined, `Unsupported channel: ${channel}`);
      }
    } catch (error) {
      this.logger.error(`Message processing error: ${error.message}`);
      await this.communicationsService.updateStatus(logId, 'failed', undefined, error.message);
      throw error;
    }
  }

  /**
   * Retry failed SMS
   */
  @Process('retry-sms')
  async handleRetrySms(job: Job<{
    messageId: string;
    to: string;
    content: string;
    retryCount: number;
  }>) {
    const { messageId, to, content, retryCount } = job.data;
    this.logger.log(`Retrying SMS ${messageId} (attempt ${retryCount})`);

    const result = await this.smsProviderManager.send({
      to,
      message: content,
      metadata: { attemptNumber: retryCount },
    });

    if (result.success) {
      this.logger.log(`SMS retry successful: ${messageId}`);
    } else {
      this.logger.error(`SMS retry failed: ${messageId} - ${result.errorMessage}`);
    }
  }
}
