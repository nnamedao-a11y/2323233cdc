/**
 * Alert Retry CRON
 * 
 * Retries failed alerts every 5 minutes
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CriticalAlertService, AlertEventType } from './critical-alert.service';

@Injectable()
export class AlertRetryCron {
  private readonly logger = new Logger(AlertRetryCron.name);
  private readonly maxAttempts = 5;

  constructor(
    @InjectModel('AlertLog') private alertLogModel: Model<any>,
    @Inject(forwardRef(() => CriticalAlertService))
    private readonly alertService: CriticalAlertService,
  ) {}

  /**
   * Process failed alerts
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedAlerts(): Promise<void> {
    const failedAlerts = await this.alertLogModel.find({
      status: 'failed',
      attempts: { $lt: this.maxAttempts },
    }).limit(10);

    if (failedAlerts.length === 0) return;

    this.logger.log(`Retrying ${failedAlerts.length} failed alerts`);

    for (const alert of failedAlerts) {
      try {
        // Re-emit the alert
        await this.alertService.emit({
          eventType: alert.eventType as AlertEventType,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          data: alert.payload,
          channels: alert.channels,
        });

        // Mark original as superseded
        alert.status = 'sent';
        alert.sentAt = new Date();
        await alert.save();

        this.logger.log(`Alert ${alert._id} retry successful`);
      } catch (error) {
        alert.attempts += 1;
        alert.lastError = error.message;

        if (alert.attempts >= this.maxAttempts) {
          alert.status = 'failed_permanent';
          this.logger.error(`Alert ${alert._id} failed permanently after ${alert.attempts} attempts`);
        }

        await alert.save();
      }
    }
  }

  /**
   * Get retry statistics
   */
  async getStats(): Promise<{
    pending: number;
    failed: number;
    failedPermanent: number;
    sent: number;
  }> {
    const [pending, failed, failedPermanent, sent] = await Promise.all([
      this.alertLogModel.countDocuments({ status: 'pending' }),
      this.alertLogModel.countDocuments({ status: 'failed' }),
      this.alertLogModel.countDocuments({ status: 'failed_permanent' }),
      this.alertLogModel.countDocuments({ status: 'sent' }),
    ]);

    return { pending, failed, failedPermanent, sent };
  }
}
