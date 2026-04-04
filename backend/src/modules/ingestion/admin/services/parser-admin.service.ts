/**
 * Parser Admin Service
 * 
 * Головний orchestration service
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ParserStateRepository } from '../repositories/parser-state.repository';
import { ParserControlService } from './parser-control.service';
import { ParserHealthAdminService } from './parser-health-admin.service';
import { ParserLogsService } from './parser-logs.service';
import { ParserAlertsService } from './parser-alerts.service';
import { ParserSettingsService } from './parser-settings.service';

@Injectable()
export class ParserAdminService implements OnModuleInit {
  constructor(
    private readonly stateRepo: ParserStateRepository,
    private readonly controlService: ParserControlService,
    private readonly healthService: ParserHealthAdminService,
    private readonly logsService: ParserLogsService,
    private readonly alertsService: ParserAlertsService,
    private readonly settingsService: ParserSettingsService,
  ) {}

  async onModuleInit() {
    // Initialize parser states
    await this.stateRepo.initializeSource('copart', '0 */4 * * *');
    await this.stateRepo.initializeSource('iaai', '30 */4 * * *');

    // Initialize settings
    await this.settingsService.initializeDefaults('copart');
    await this.settingsService.initializeDefaults('iaai');
  }

  // ==================== OVERVIEW ====================

  async getParsersOverview() {
    const states = await this.stateRepo.findAll();
    const alertCounts = await this.alertsService.getAlertCounts();

    return {
      parsers: states,
      alerts: alertCounts,
    };
  }

  async getParserDetails(source: string) {
    const state = await this.stateRepo.findBySource(source);
    const settings = await this.settingsService.getBySource(source);
    const alerts = await this.alertsService.getActiveAlerts(source);
    const recentLogs = await this.logsService.findBySource(source, 20);

    return {
      state,
      settings,
      alerts,
      recentLogs,
    };
  }

  // ==================== CONTROL ====================

  async run(source: string, userId: string) {
    return this.controlService.run(source, userId);
  }

  async stop(source: string, userId: string, reason?: string) {
    return this.controlService.stop(source, userId, reason);
  }

  async resume(source: string, userId: string) {
    return this.controlService.resume(source, userId);
  }

  async restart(source: string, userId: string) {
    return this.controlService.restart(source, userId);
  }

  async runAll(userId: string) {
    return this.controlService.runAll(userId);
  }

  async stopAll(userId: string, reason?: string) {
    return this.controlService.stopAll(userId, reason);
  }

  async resetCircuitBreaker(source: string, userId: string) {
    return this.controlService.resetCircuitBreaker(source, userId);
  }

  // ==================== HEALTH ====================

  async getHealthOverview() {
    return this.healthService.getOverview();
  }

  async getSourceHealth(source: string) {
    return this.healthService.getSourceHealth(source);
  }

  // ==================== LOGS ====================

  async getLogs(query: any) {
    return this.logsService.findAll(query);
  }

  async getLogsBySource(source: string, limit?: number) {
    return this.logsService.findBySource(source, limit);
  }

  async getErrors(source?: string, limit?: number) {
    return this.logsService.findErrors(source, limit);
  }

  // ==================== ALERTS ====================

  async getAlerts(includeResolved = false) {
    return this.alertsService.getAllAlerts(includeResolved);
  }

  async resolveAlert(id: string, userId: string) {
    return this.alertsService.resolveAlert(id, userId);
  }

  // ==================== SETTINGS ====================

  async getSettings() {
    return this.settingsService.getAll();
  }

  async getSettingsBySource(source: string) {
    return this.settingsService.getBySource(source);
  }

  async updateSettings(source: string, dto: any, userId: string) {
    return this.settingsService.update(source, dto, userId);
  }
}
