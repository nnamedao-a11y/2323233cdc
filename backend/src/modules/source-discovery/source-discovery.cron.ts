/**
 * Source Discovery Cron
 * 
 * Scheduled tasks:
 * - Every hour: promote qualified sources to registry
 * - Every day: cleanup old non-qualifying sources
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SourceOnboardingService } from './source-onboarding.service';
import { SourceDiscoveryService } from './source-discovery.service';

@Injectable()
export class SourceDiscoveryCron {
  private readonly logger = new Logger(SourceDiscoveryCron.name);

  constructor(
    private readonly onboarding: SourceOnboardingService,
    private readonly discovery: SourceDiscoveryService,
  ) {}

  /**
   * Promote qualified sources every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async promoteSources() {
    this.logger.log('Running source promotion (hourly)');
    
    try {
      const result = await this.onboarding.promoteSources();
      
      if (result.promoted > 0) {
        this.logger.log(
          `Source promotion complete: ${result.promoted} promoted, ${result.failed} failed`
        );
      }
    } catch (error: any) {
      this.logger.error(`Source promotion failed: ${error.message}`);
    }
  }

  /**
   * Log discovery stats every 6 hours
   */
  @Cron('0 */6 * * *')
  async logStats() {
    try {
      const stats = await this.discovery.getStats();
      
      this.logger.log(
        `Discovery Stats: total=${stats.total}, vinSupport=${stats.withVinSupport}, ` +
        `promotionReady=${stats.promotionReady}, addedToRegistry=${stats.addedToRegistry}, ` +
        `avgReliability=${(stats.avgReliability * 100).toFixed(1)}%`
      );
    } catch (error: any) {
      this.logger.error(`Failed to get discovery stats: ${error.message}`);
    }
  }
}
