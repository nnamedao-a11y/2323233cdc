/**
 * Retry Queue Service
 * 
 * Обробка черги повторних спроб
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RetryQueue, RetryType, RetryStatus } from './retry-queue.schema';
import { SystemErrorService } from '../system-errors/system-error.service';

@Injectable()
export class RetryQueueService {
  private readonly logger = new Logger(RetryQueueService.name);
  private handlers: Map<RetryType, (payload: any) => Promise<boolean>> = new Map();

  constructor(
    @InjectModel(RetryQueue.name) private retryModel: Model<RetryQueue>,
    private readonly errorService: SystemErrorService,
  ) {}

  /**
   * Register a handler for a retry type
   */
  registerHandler(type: RetryType, handler: (payload: any) => Promise<boolean>): void {
    this.handlers.set(type, handler);
    this.logger.log(`Registered handler for ${type}`);
  }

  /**
   * Add item to retry queue
   */
  async enqueue(
    type: RetryType,
    entityId: string,
    payload: Record<string, any>,
    options?: { maxAttempts?: number; delayMinutes?: number },
  ): Promise<RetryQueue> {
    const existing = await this.retryModel.findOne({
      type,
      entityId,
      status: { $in: [RetryStatus.PENDING, RetryStatus.PROCESSING] },
    });

    if (existing) {
      // Update existing
      existing.payload = payload;
      existing.nextRetryAt = new Date(Date.now() + (options?.delayMinutes || 5) * 60 * 1000);
      await existing.save();
      return existing;
    }

    // Create new
    const item = new this.retryModel({
      type,
      entityId,
      payload,
      status: RetryStatus.PENDING,
      maxAttempts: options?.maxAttempts || 5,
      nextRetryAt: new Date(Date.now() + (options?.delayMinutes || 5) * 60 * 1000),
    });

    await item.save();
    this.logger.log(`Enqueued retry: ${type} for ${entityId}`);
    return item;
  }

  /**
   * Process retry queue
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processQueue(): Promise<void> {
    const items = await this.retryModel.find({
      status: RetryStatus.PENDING,
      nextRetryAt: { $lte: new Date() },
    }).limit(20);

    for (const item of items) {
      await this.processItem(item);
    }
  }

  /**
   * Process single retry item
   */
  private async processItem(item: any): Promise<void> {
    const handler = this.handlers.get(item.type);
    if (!handler) {
      this.logger.warn(`No handler for retry type: ${item.type}`);
      return;
    }

    // Mark as processing
    item.status = RetryStatus.PROCESSING;
    item.attempts += 1;
    item.lastAttemptAt = new Date();
    await item.save();

    try {
      const success = await handler(item.payload);

      if (success) {
        item.status = RetryStatus.COMPLETED;
        item.completedAt = new Date();
        this.logger.log(`Retry completed: ${item.type} for ${item.entityId}`);
      } else {
        throw new Error('Handler returned false');
      }
    } catch (error) {
      item.lastError = error.message;

      if (item.attempts >= item.maxAttempts) {
        item.status = RetryStatus.FAILED;
        this.logger.error(`Retry failed permanently: ${item.type} for ${item.entityId}`);

        await this.errorService.logError({
          module: 'RetryQueue',
          action: item.type,
          error: `Max retries exceeded: ${error.message}`,
          payload: { entityId: item.entityId, attempts: item.attempts },
        });
      } else {
        // Schedule next retry with exponential backoff
        item.status = RetryStatus.PENDING;
        item.nextRetryAt = new Date(Date.now() + Math.pow(2, item.attempts) * 60 * 1000);
        this.logger.warn(`Retry scheduled: ${item.type} for ${item.entityId}, attempt ${item.attempts}`);
      }
    }

    await item.save();
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byType: Record<string, number>;
  }> {
    const stats = await this.retryModel.aggregate([
      { $group: { _id: { status: '$status', type: '$type' }, count: { $sum: 1 } } },
    ]);

    const result = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      byType: {} as Record<string, number>,
    };

    for (const stat of stats) {
      result[stat._id.status] = (result[stat._id.status] || 0) + stat.count;
      result.byType[stat._id.type] = (result.byType[stat._id.type] || 0) + stat.count;
    }

    return result;
  }

  /**
   * Manually retry a failed item
   */
  async manualRetry(itemId: string): Promise<boolean> {
    const item = await this.retryModel.findById(itemId);
    if (!item) return false;

    item.status = RetryStatus.PENDING;
    item.attempts = 0;
    item.nextRetryAt = new Date();
    await item.save();

    return true;
  }
}
