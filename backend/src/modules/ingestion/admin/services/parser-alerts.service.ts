/**
 * Parser Alerts Service
 */

import { Injectable, Logger } from '@nestjs/common';
import { ParserAlertRepository } from '../repositories/parser-alert.repository';
import { ParserStateRepository } from '../repositories/parser-state.repository';
import { ParserAlertLevel, ParserAlertCode } from '../enums/parser-status.enum';

@Injectable()
export class ParserAlertsService {
  private readonly logger = new Logger(ParserAlertsService.name);

  constructor(
    private readonly alertRepo: ParserAlertRepository,
    private readonly stateRepo: ParserStateRepository,
  ) {}

  async createAlert(
    source: string,
    level: ParserAlertLevel,
    code: string,
    title: string,
    description?: string,
    meta?: Record<string, any>,
  ) {
    // Перевіряємо чи вже є активний alert з таким кодом
    const existing = await this.alertRepo.findActiveByCode(source, code);
    if (existing) {
      this.logger.debug(`Alert ${code} already exists for ${source}`);
      return existing;
    }

    const alert = await this.alertRepo.create({
      source,
      level,
      code,
      title,
      description,
      meta,
    });

    this.logger.warn(`Alert created: ${code} - ${title} for ${source}`);
    return alert;
  }

  async checkAndCreateAlerts(source: string): Promise<void> {
    const state = await this.stateRepo.findBySource(source);
    if (!state) return;

    // Parser degraded (3+ consecutive failures)
    if (state.consecutiveFailures >= 3) {
      await this.createAlert(
        source,
        ParserAlertLevel.WARNING,
        ParserAlertCode.PARSER_DEGRADED,
        `${source.toUpperCase()} parser degraded`,
        `Parser has ${state.consecutiveFailures} consecutive failures`,
        { consecutiveFailures: state.consecutiveFailures },
      );
    }

    // Parser down (5+ consecutive failures)
    if (state.consecutiveFailures >= 5) {
      await this.createAlert(
        source,
        ParserAlertLevel.CRITICAL,
        ParserAlertCode.PARSER_DOWN,
        `${source.toUpperCase()} parser is DOWN`,
        `Parser has ${state.consecutiveFailures} consecutive failures and appears to be non-functional`,
        { consecutiveFailures: state.consecutiveFailures },
      );
    }

    // No recent success (24+ hours)
    if (state.lastSuccessAt) {
      const hoursSinceSuccess = (Date.now() - state.lastSuccessAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSuccess >= 24) {
        await this.createAlert(
          source,
          ParserAlertLevel.WARNING,
          ParserAlertCode.NO_RECENT_SUCCESS,
          `${source.toUpperCase()} has no recent success`,
          `Last successful run was ${Math.round(hoursSinceSuccess)} hours ago`,
          { lastSuccessAt: state.lastSuccessAt, hoursSinceSuccess },
        );
      }
    }
  }

  async createProxyAlert(level: ParserAlertLevel, code: string, title: string, meta?: any) {
    return this.createAlert('system', level, code, title, undefined, meta);
  }

  async resolveAlert(id: string, userId: string) {
    return this.alertRepo.resolve(id, userId);
  }

  async resolveByCode(source: string, code: string, userId: string) {
    return this.alertRepo.resolveByCode(source, code, userId);
  }

  async getActiveAlerts(source?: string) {
    if (source) {
      return this.alertRepo.findBySource(source, false);
    }
    return this.alertRepo.findAll(false);
  }

  async getAllAlerts(includeResolved = false) {
    return this.alertRepo.findAll(includeResolved);
  }

  async getAlertCounts() {
    return this.alertRepo.countActive();
  }
}
