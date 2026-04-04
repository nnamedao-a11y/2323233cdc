/**
 * Source Optimization Cron
 * 
 * Scheduled tasks for auto-optimization:
 * - Every 15 minutes: recompute system scores
 * - Every hour: cleanup old data / decay stats
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SourceOptimizationService } from './source-optimization.service';

@Injectable()
export class SourceOptimizationCron {
  private readonly logger = new Logger(SourceOptimizationCron.name);

  constructor(private readonly optimization: SourceOptimizationService) {}

  /**
   * Recompute system scores every 15 minutes
   */
  @Cron('*/15 * * * *')
  async recomputeWeights() {
    this.logger.log('Running source auto-optimization (15-min schedule)');
    
    try {
      const result = await this.optimization.recomputeAll();
      this.logger.log(
        `Auto-optimization done: ${result.updated} updated, ${result.disabled} disabled, ${result.enabled} enabled`
      );
    } catch (error) {
      this.logger.error(`Auto-optimization failed: ${error.message}`);
    }
  }

  /**
   * Generate health report every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async generateHealthReport() {
    this.logger.log('Generating source health report');
    
    try {
      const report = await this.optimization.getReport();
      
      const critical = report.sources.filter(s => s.health === 'critical');
      const poor = report.sources.filter(s => s.health === 'poor');
      
      if (critical.length > 0) {
        this.logger.warn(
          `CRITICAL sources (${critical.length}): ${critical.map(s => s.name).join(', ')}`
        );
      }
      
      if (poor.length > 0) {
        this.logger.warn(
          `Poor health sources (${poor.length}): ${poor.map(s => s.name).join(', ')}`
        );
      }
    } catch (error) {
      this.logger.error(`Health report failed: ${error.message}`);
    }
  }
}
