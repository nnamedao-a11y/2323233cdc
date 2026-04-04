/**
 * Parser Admin Controller
 * 
 * Endpoints для керування парсерами
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { ParserAdminService } from '../services/parser-admin.service';
import { RunParserDto, QueryParserLogsDto, UpdateParserSettingsDto } from '../dto/parser-admin.dto';
import { UserRole } from '../../../../shared/enums';

@Controller('ingestion/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParserAdminController {
  constructor(private readonly adminService: ParserAdminService) {}

  // ==================== PARSERS OVERVIEW ====================

  /**
   * GET /api/ingestion/admin/parsers
   * 
   * Огляд всіх парсерів
   */
  @Get('parsers')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getParsersOverview() {
    return this.adminService.getParsersOverview();
  }

  /**
   * GET /api/ingestion/admin/parsers/:source
   * 
   * Деталі конкретного парсера
   */
  @Get('parsers/:source')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getParserDetails(@Param('source') source: string) {
    return this.adminService.getParserDetails(source);
  }

  // ==================== PARSER CONTROL ====================

  /**
   * POST /api/ingestion/admin/parsers/:source/run
   * 
   * Запустити парсер вручну
   */
  @Post('parsers/:source/run')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async runParser(
    @Param('source') source: string,
    @Body() dto: RunParserDto,
    @Req() req: any,
  ) {
    return this.adminService.run(source, req.user?.id || 'admin');
  }

  /**
   * POST /api/ingestion/admin/parsers/:source/stop
   * 
   * Зупинити/призупинити парсер
   */
  @Post('parsers/:source/stop')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async stopParser(
    @Param('source') source: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.adminService.stop(source, req.user?.id || 'admin', body.reason);
  }

  /**
   * POST /api/ingestion/admin/parsers/:source/resume
   * 
   * Відновити роботу парсера
   */
  @Post('parsers/:source/resume')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async resumeParser(
    @Param('source') source: string,
    @Req() req: any,
  ) {
    return this.adminService.resume(source, req.user?.id || 'admin');
  }

  /**
   * POST /api/ingestion/admin/parsers/:source/restart
   * 
   * Перезапустити парсер
   */
  @Post('parsers/:source/restart')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async restartParser(
    @Param('source') source: string,
    @Req() req: any,
  ) {
    return this.adminService.restart(source, req.user?.id || 'admin');
  }

  /**
   * POST /api/ingestion/admin/parsers/run-all
   * 
   * Запустити всі парсери
   */
  @Post('parsers/run-all')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async runAllParsers(@Req() req: any) {
    return this.adminService.runAll(req.user?.id || 'admin');
  }

  /**
   * POST /api/ingestion/admin/parsers/stop-all
   * 
   * Зупинити всі парсери
   */
  @Post('parsers/stop-all')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async stopAllParsers(
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.adminService.stopAll(req.user?.id || 'admin', body.reason);
  }

  /**
   * POST /api/ingestion/admin/parsers/:source/circuit-breaker/reset
   * 
   * Reset circuit breaker
   */
  @Post('parsers/:source/circuit-breaker/reset')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async resetCircuitBreaker(
    @Param('source') source: string,
    @Req() req: any,
  ) {
    return this.adminService.resetCircuitBreaker(source, req.user?.id || 'admin');
  }

  // ==================== HEALTH ====================

  /**
   * GET /api/ingestion/admin/health
   * 
   * Загальний health overview
   */
  @Get('health')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getHealthOverview() {
    return this.adminService.getHealthOverview();
  }

  /**
   * GET /api/ingestion/admin/health/:source
   * 
   * Health конкретного парсера
   */
  @Get('health/:source')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getSourceHealth(@Param('source') source: string) {
    return this.adminService.getSourceHealth(source);
  }

  // ==================== LOGS ====================

  /**
   * GET /api/ingestion/admin/logs
   * 
   * Логи з фільтрами та пагінацією
   */
  @Get('logs')
  @Roles(UserRole.OWNER)
  async getLogs(@Query() query: QueryParserLogsDto) {
    return this.adminService.getLogs(query);
  }

  /**
   * GET /api/ingestion/admin/logs/:source
   * 
   * Логи конкретного парсера
   */
  @Get('logs/:source')
  @Roles(UserRole.OWNER)
  async getLogsBySource(
    @Param('source') source: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getLogsBySource(source, limit ? parseInt(limit) : undefined);
  }

  /**
   * GET /api/ingestion/admin/logs/errors
   * 
   * Тільки помилки
   */
  @Get('errors')
  @Roles(UserRole.OWNER)
  async getErrors(
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getErrors(source, limit ? parseInt(limit) : undefined);
  }

  // ==================== ALERTS ====================

  /**
   * GET /api/ingestion/admin/alerts
   * 
   * Активні alerts
   */
  @Get('alerts')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getAlerts(@Query('includeResolved') includeResolved?: string) {
    return this.adminService.getAlerts(includeResolved === 'true');
  }

  /**
   * POST /api/ingestion/admin/alerts/:id/resolve
   * 
   * Закрити alert
   */
  @Post('alerts/:id/resolve')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async resolveAlert(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.adminService.resolveAlert(id, req.user?.id || 'admin');
  }

  // ==================== SETTINGS ====================

  /**
   * GET /api/ingestion/admin/settings
   * 
   * Налаштування всіх парсерів
   */
  @Get('settings')
  @Roles(UserRole.OWNER)
  async getSettings() {
    return this.adminService.getSettings();
  }

  /**
   * GET /api/ingestion/admin/settings/:source
   * 
   * Налаштування конкретного парсера
   */
  @Get('settings/:source')
  @Roles(UserRole.OWNER)
  async getSettingsBySource(@Param('source') source: string) {
    return this.adminService.getSettingsBySource(source);
  }

  /**
   * PATCH /api/ingestion/admin/settings/:source
   * 
   * Оновити налаштування парсера
   */
  @Patch('settings/:source')
  @Roles(UserRole.OWNER)
  async updateSettings(
    @Param('source') source: string,
    @Body() dto: UpdateParserSettingsDto,
    @Req() req: any,
  ) {
    return this.adminService.updateSettings(source, dto, req.user?.id || 'admin');
  }
}
