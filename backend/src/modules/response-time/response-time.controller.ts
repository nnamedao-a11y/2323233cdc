import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ResponseTimeService, ResponseTimeMetrics, TeamResponseMetrics } from './response-time.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('response-time')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResponseTimeController {
  constructor(private readonly responseTimeService: ResponseTimeService) {}

  @Get('team')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getTeamMetrics(
    @Query('days') days: number = 7,
  ): Promise<TeamResponseMetrics> {
    return this.responseTimeService.getTeamMetrics(days);
  }

  @Get('manager/:managerId')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.MANAGER)
  async getManagerMetrics(
    @Param('managerId') managerId: string,
    @Query('days') days: number = 7,
  ): Promise<ResponseTimeMetrics> {
    return this.responseTimeService.getManagerMetrics(managerId, days);
  }

  @Get('alerts')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getPendingAlerts(
    @Query('threshold') threshold: number = 300,
  ) {
    return this.responseTimeService.getPendingAlerts(threshold);
  }

  @Post('track/lead-assigned')
  async trackLeadAssigned(
    @Body() body: { managerId: string; leadId: string; dealId?: string },
  ) {
    return this.responseTimeService.trackLeadAssigned(
      body.managerId,
      body.leadId,
      body.dealId,
    );
  }

  @Post('track/call-required')
  async trackCallRequired(
    @Body() body: { managerId: string; leadId: string },
  ) {
    return this.responseTimeService.trackCallRequired(body.managerId, body.leadId);
  }

  @Post('resolve')
  async resolveEvent(
    @Body() body: { managerId: string; leadId: string; eventType: string },
  ) {
    return this.responseTimeService.resolveEvent(
      body.managerId,
      body.leadId,
      body.eventType,
    );
  }
}
