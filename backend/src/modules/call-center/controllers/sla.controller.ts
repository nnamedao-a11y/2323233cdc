import { Controller, Get, Post, Param, Query, UseGuards, Body, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../shared/enums';
import { SlaBbreachService, SLA_CONFIG } from '../services/sla-breach.service';

@Controller('sla')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SlaController {
  constructor(private readonly slaService: SlaBbreachService) {}

  // Отримати конфігурацію SLA
  @Get('config')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  getConfig() {
    return SLA_CONFIG;
  }

  // Активні порушення SLA
  @Get('breaches')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  getActiveBreaches() {
    return this.slaService.getActiveBreaches();
  }

  // Статистика SLA
  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  getBreachStats() {
    return this.slaService.getBreachStats();
  }

  // Порушення по менеджеру
  @Get('breaches/manager/:managerId')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  getManagerBreaches(@Param('managerId') managerId: string) {
    return this.slaService.getBreachesByManager(managerId);
  }

  // Вручну запустити перевірку callback SLA
  @Post('check/callbacks')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async triggerCallbackCheck() {
    await this.slaService.checkCallbackSla();
    return { success: true, message: 'Callback SLA check triggered' };
  }

  // Вручну запустити перевірку lead SLA
  @Post('check/leads')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async triggerLeadCheck() {
    await this.slaService.checkLeadSla();
    return { success: true, message: 'Lead SLA check triggered' };
  }

  // Позначити breach як вирішений
  @Post('breaches/:type/:entityId/resolve')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async resolveBreach(
    @Param('type') type: string,
    @Param('entityId') entityId: string,
  ) {
    await this.slaService.resolveBreach(type, entityId);
    return { success: true, message: 'Breach resolved' };
  }
}
