/**
 * Parser Control Service
 * 
 * Міст між UI і runner-ами
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ParserStateRepository } from '../repositories/parser-state.repository';
import { ParserLogsService } from './parser-logs.service';
import { ParserAlertsService } from './parser-alerts.service';
import { ParserStatus, ParserLogEvent, ParserAlertCode } from '../enums/parser-status.enum';
import { CopartRunner } from '../../runners/copart.runner';
import { IAAIRunner } from '../../runners/iaai.runner';
import { CircuitBreakerService } from '../../antiblock';

@Injectable()
export class ParserControlService {
  private readonly logger = new Logger(ParserControlService.name);

  constructor(
    private readonly stateRepo: ParserStateRepository,
    private readonly logsService: ParserLogsService,
    private readonly alertsService: ParserAlertsService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly copartRunner: CopartRunner,
    private readonly iaaiRunner: IAAIRunner,
  ) {}

  private getRunner(source: string) {
    switch (source.toLowerCase()) {
      case 'copart':
        return this.copartRunner;
      case 'iaai':
        return this.iaaiRunner;
      default:
        throw new NotFoundException(`Unknown parser source: ${source}`);
    }
  }

  async run(source: string, userId: string): Promise<{
    success: boolean;
    message: string;
    result?: any;
    error?: string;
  }> {
    const runner = this.getRunner(source);
    const startTime = Date.now();

    try {
      // Перевіряємо чи не paused
      const state = await this.stateRepo.findBySource(source);
      if (state?.isPaused) {
        return {
          success: false,
          message: 'Parser is paused',
          error: state.pauseReason || 'Paused by admin',
        };
      }

      // Mark running
      await this.stateRepo.markRunning(source, userId);
      await this.logsService.logRunStart(source, userId);

      this.logger.log(`[${source}] Manual run started by ${userId}`);

      // Run parser
      const result = await runner.run();
      const durationMs = Date.now() - startTime;

      if (result.success) {
        // Mark success
        await this.stateRepo.markSuccess(source, {
          itemsParsed: result.fetched || 0,
          itemsCreated: result.created || 0,
          itemsUpdated: result.updated || 0,
          lastDurationMs: durationMs,
        });

        await this.logsService.logRunFinished(source, {
          itemsParsed: result.fetched || 0,
          itemsCreated: result.created || 0,
          itemsUpdated: result.updated || 0,
          durationMs,
        });

        // Resolve any active alerts
        await this.alertsService.resolveByCode(source, ParserAlertCode.PARSER_DEGRADED, 'system');
        await this.alertsService.resolveByCode(source, ParserAlertCode.PARSER_DOWN, 'system');

        return {
          success: true,
          message: `Parser completed in ${(durationMs / 1000).toFixed(1)}s`,
          result,
        };
      } else {
        // Mark failure
        await this.stateRepo.markFailure(source, result.errors?.[0] || 'Unknown error', {
          lastDurationMs: durationMs,
        });

        await this.logsService.logRunFailed(source, result.errors?.[0] || 'Unknown error', {
          errors: result.errors,
          durationMs,
        });

        // Check and create alerts
        await this.alertsService.checkAndCreateAlerts(source);

        return {
          success: false,
          message: 'Parser failed',
          error: result.errors?.[0],
          result,
        };
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      
      await this.stateRepo.markFailure(source, error.message, { lastDurationMs: durationMs });
      await this.logsService.logRunFailed(source, error.message, { durationMs });
      await this.alertsService.checkAndCreateAlerts(source);

      this.logger.error(`[${source}] Manual run failed: ${error.message}`);

      return {
        success: false,
        message: 'Parser error',
        error: error.message,
      };
    }
  }

  async stop(source: string, userId: string, reason?: string): Promise<{ success: boolean }> {
    await this.stateRepo.markStopped(source, reason || 'Stopped from admin panel', userId);
    await this.logsService.warn(source, ParserLogEvent.RUN_STOPPED, 'Parser paused by admin', {
      triggeredBy: userId,
      reason,
    });

    this.logger.log(`[${source}] Stopped by ${userId}: ${reason || 'No reason'}`);
    return { success: true };
  }

  async resume(source: string, userId: string): Promise<{ success: boolean }> {
    const state = await this.stateRepo.findBySource(source);
    if (!state) {
      throw new NotFoundException(`Parser state not found: ${source}`);
    }

    await this.stateRepo.markIdle(source);
    await this.logsService.info(source, 'run_resumed', 'Parser resumed by admin', {
      triggeredBy: userId,
    });

    this.logger.log(`[${source}] Resumed by ${userId}`);
    return { success: true };
  }

  async restart(source: string, userId: string): Promise<{ success: boolean; result?: any }> {
    await this.stop(source, userId, 'Restart requested');
    
    // Невелика пауза
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Resume and run
    await this.stateRepo.markIdle(source);
    return this.run(source, userId);
  }

  async runAll(userId: string): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    for (const source of ['copart', 'iaai']) {
      results[source] = await this.run(source, userId);
    }

    return results;
  }

  async stopAll(userId: string, reason?: string): Promise<{ success: boolean }> {
    for (const source of ['copart', 'iaai']) {
      await this.stop(source, userId, reason);
    }
    return { success: true };
  }

  async resetCircuitBreaker(source: string, userId: string): Promise<{ success: boolean }> {
    const key = `${source}_main`;
    this.circuitBreaker.reset(key);
    
    await this.logsService.info(source, 'circuit_reset', 'Circuit breaker reset by admin', {
      triggeredBy: userId,
    });

    // Resolve circuit breaker alert
    await this.alertsService.resolveByCode(source, ParserAlertCode.CIRCUIT_BREAKER_OPEN, userId);

    this.logger.log(`[${source}] Circuit breaker reset by ${userId}`);
    return { success: true };
  }
}
