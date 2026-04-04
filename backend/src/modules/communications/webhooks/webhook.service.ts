import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import * as crypto from 'crypto';
import { Message } from '../schemas/message.schema';
import { TimelineService } from '../timeline/timeline.service';
import { CommunicationEventType } from '../schemas/communication-event.schema';

/**
 * Twilio Webhook DTO
 */
export interface TwilioStatusWebhookDto {
  MessageSid: string;
  MessageStatus: string;
  To: string;
  From?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  AccountSid?: string;
  ApiVersion?: string;
}

/**
 * Webhook Service - Обробка delivery status від провайдерів
 * 
 * Функції:
 * - Валідація Twilio signature
 * - Оновлення статусу повідомлення
 * - Тригер подій для automation
 * - Запис в timeline
 * - Retry logic для failed messages
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly twilioAuthToken: string;

  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectQueue('communications') private communicationsQueue: Queue,
    @InjectQueue('automation') private automationQueue: Queue,
    private configService: ConfigService,
    private timelineService: TimelineService,
  ) {
    this.twilioAuthToken = this.configService.get('TWILIO_AUTH_TOKEN') || '';
  }

  /**
   * Обробка Twilio status webhook
   */
  async processTwilioStatus(
    dto: TwilioStatusWebhookDto,
    signature?: string,
    url?: string
  ): Promise<{ success: boolean; messageId?: string; status?: string }> {
    
    // Валідація signature (якщо authToken налаштований)
    if (this.twilioAuthToken && signature && url) {
      const isValid = this.validateTwilioSignature(signature, url, dto);
      if (!isValid) {
        this.logger.warn(`Invalid Twilio signature for MessageSid: ${dto.MessageSid}`);
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    // Знаходимо повідомлення
    const message = await this.messageModel.findOne({ providerMessageId: dto.MessageSid });
    
    if (!message) {
      this.logger.warn(`Message not found for MessageSid: ${dto.MessageSid}`);
      return { success: false };
    }

    // Маппінг статусу
    const status = this.mapTwilioStatus(dto.MessageStatus);
    const previousStatus = message.status;

    // Оновлення повідомлення
    const updateData: any = {
      status,
      errorCode: dto.ErrorCode,
      errorMessage: dto.ErrorMessage,
    };

    // Timestamps
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    } else if (status === 'failed' || status === 'undelivered') {
      updateData.failedAt = new Date();
    }

    await this.messageModel.findByIdAndUpdate(message._id, { $set: updateData });

    this.logger.log(`Message ${message.id} status updated: ${previousStatus} → ${status}`);

    // Додаємо в timeline
    await this.addToTimeline(message, status, dto.ErrorCode);

    // Тригеримо automation events
    await this.emitStatusEvent(message, status, previousStatus);

    // Retry logic для failed messages
    if (status === 'failed' && message.retryCount < message.maxRetries) {
      await this.scheduleRetry(message);
    }

    return { 
      success: true, 
      messageId: message.id,
      status 
    };
  }

  /**
   * Валідація Twilio signature (HMAC-SHA1)
   */
  private validateTwilioSignature(
    signature: string,
    url: string,
    params: Record<string, any>
  ): boolean {
    if (!this.twilioAuthToken) {
      return true; // Skip validation if no auth token
    }

    // Сортуємо параметри
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], '');

    const data = url + sortedParams;
    
    const expectedSignature = crypto
      .createHmac('sha1', this.twilioAuthToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Маппінг Twilio статусів
   */
  private mapTwilioStatus(twilioStatus: string): Message['status'] {
    const statusMap: Record<string, Message['status']> = {
      queued: 'queued',
      sending: 'queued',
      sent: 'sent',
      delivered: 'delivered',
      undelivered: 'undelivered',
      failed: 'failed',
      read: 'delivered', // WhatsApp
    };
    return statusMap[twilioStatus.toLowerCase()] || 'pending';
  }

  /**
   * Додавання події в timeline
   */
  private async addToTimeline(
    message: Message,
    status: string,
    errorCode?: string
  ): Promise<void> {
    const eventTypeMap: Record<string, CommunicationEventType> = {
      sent: 'sms_sent',
      delivered: 'sms_delivered',
      failed: 'sms_failed',
      undelivered: 'sms_undelivered',
    };

    const eventType = eventTypeMap[status];
    if (!eventType) return;

    const titleMap: Record<string, string> = {
      sms_sent: 'SMS відправлено',
      sms_delivered: 'SMS доставлено ✓',
      sms_failed: 'SMS не вдалося відправити ✗',
      sms_undelivered: 'SMS не доставлено ✗',
    };

    await this.timelineService.addEvent({
      leadId: message.leadId,
      customerId: message.customerId,
      type: eventType,
      channel: 'sms',
      messageId: message.id,
      title: titleMap[eventType] || `SMS ${status}`,
      description: errorCode ? `Код помилки: ${errorCode}` : undefined,
      meta: {
        phone: message.to,
        errorCode,
      },
      isAutomated: true,
    });
  }

  /**
   * Emit status event для automation
   */
  private async emitStatusEvent(
    message: Message,
    status: string,
    previousStatus: string
  ): Promise<void> {
    // Emit event тільки якщо статус змінився
    if (status === previousStatus) return;

    const eventName = `sms.${status}`;
    
    await this.automationQueue.add('status-event', {
      event: eventName,
      messageId: message.id,
      leadId: message.leadId,
      customerId: message.customerId,
      status,
      previousStatus,
      phone: message.to,
      timestamp: new Date(),
    });

    this.logger.log(`Emitted automation event: ${eventName} for ${message.leadId || message.customerId}`);
  }

  /**
   * Запланувати retry для failed message
   */
  private async scheduleRetry(message: Message): Promise<void> {
    const retryDelayMinutes = [5, 15, 30][message.retryCount] || 30; // 5хв, 15хв, 30хв

    await this.messageModel.findByIdAndUpdate(message._id, {
      $inc: { retryCount: 1 },
      $set: { 
        nextRetryAt: new Date(Date.now() + retryDelayMinutes * 60 * 1000),
        status: 'queued'
      }
    });

    await this.communicationsQueue.add('retry-sms', {
      messageId: message.id,
      to: message.to,
      content: message.content,
      retryCount: message.retryCount + 1,
    }, {
      delay: retryDelayMinutes * 60 * 1000,
    });

    this.logger.log(`Scheduled SMS retry #${message.retryCount + 1} for ${message.id} in ${retryDelayMinutes} minutes`);
  }

  /**
   * Отримати статус повідомлення (manual check)
   */
  async getMessageStatus(messageId: string): Promise<any> {
    const message = await this.messageModel.findOne({ id: messageId });
    if (!message) return null;

    return {
      id: message.id,
      status: message.status,
      to: message.to,
      provider: message.provider,
      providerMessageId: message.providerMessageId,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      failedAt: message.failedAt,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      retryCount: message.retryCount,
    };
  }
}
