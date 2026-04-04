/**
 * Source Validation CRON Service
 * 
 * Автоматична валідація джерел кожні 2 години
 * - Тестує sample VINs
 * - Рахує hit rate
 * - Автоматично деградує/активує джерела
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ValidationService } from '../validation/validation.service';
import { SourceService } from '../sources/source.service';

@Injectable()
export class SourceValidationCron {
  private readonly logger = new Logger(SourceValidationCron.name);
  private isRunning = false;

  constructor(
    private readonly validationService: ValidationService,
    private readonly sourceService: SourceService,
  ) {}

  /**
   * Validate all active sources every 2 hours
   */
  @Cron('0 */2 * * *') // Every 2 hours
  async validateActiveSources(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[CRON] Validation already running, skipping');
      return;
    }

    this.isRunning = true;
    this.logger.log('[CRON] Starting scheduled source validation...');

    try {
      const reports = await this.validationService.validateAll();
      
      const summary = {
        total: reports.length,
        activated: reports.filter(r => r.recommendation === 'activate').length,
        degraded: reports.filter(r => r.recommendation === 'degrade').length,
        disabled: reports.filter(r => r.recommendation === 'disable').length,
        healthy: reports.filter(r => r.recommendation === 'keep').length,
      };

      this.logger.log(
        `[CRON] Validation complete: ` +
        `${summary.healthy} healthy, ` +
        `${summary.activated} activated, ` +
        `${summary.degraded} degraded, ` +
        `${summary.disabled} disabled`
      );
    } catch (error: any) {
      this.logger.error(`[CRON] Validation error: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Health check every 30 minutes
   */
  @Cron('*/30 * * * *') // Every 30 minutes
  async healthCheck(): Promise<void> {
    try {
      const { healthy, unhealthy, results } = await this.validationService.healthCheckAll();
      
      if (unhealthy > 0) {
        this.logger.warn(
          `[CRON] Health check: ${healthy}/${healthy + unhealthy} healthy, ` +
          `${unhealthy} unhealthy`
        );
        
        // Log unhealthy sources
        for (const result of results.filter(r => !r.healthy)) {
          this.logger.warn(`  - ${result.source}: ${result.message}`);
        }
      } else {
        this.logger.debug(`[CRON] Health check: all ${healthy} sources healthy`);
      }
    } catch (error: any) {
      this.logger.error(`[CRON] Health check error: ${error.message}`);
    }
  }

  /**
   * Cleanup quarantined sources weekly
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupQuarantined(): Promise<void> {
    this.logger.log('[CRON] Cleaning up old quarantined sources...');
    
    try {
      const allSources = await this.sourceService.getAll();
      const quarantined = allSources.filter(s => s.quarantine);
      
      // Try to re-validate old quarantined sources
      for (const source of quarantined) {
        // If quarantined for more than 7 days, try to recover
        const lastTested = source.lastTestedAt || source.lastFailureAt;
        if (lastTested) {
          const daysSince = (Date.now() - new Date(lastTested).getTime()) / (24 * 60 * 60 * 1000);
          
          if (daysSince > 7) {
            this.logger.log(`[CRON] Attempting to recover ${source.name} from quarantine`);
            
            // Reset and test
            await this.sourceService.update(source.name, {
              quarantine: false,
              status: 'testing',
              consecutiveFailures: 0,
            });
            
            const report = await this.validationService.validateSource(source);
            
            if (report.result.hitRate > 0.3) {
              await this.sourceService.activate(source.name);
              this.logger.log(`[CRON] Recovered ${source.name} from quarantine`);
            } else {
              await this.sourceService.quarantineSource(source.name, 'Still not working after recovery attempt');
            }
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`[CRON] Cleanup error: ${error.message}`);
    }
  }
}
