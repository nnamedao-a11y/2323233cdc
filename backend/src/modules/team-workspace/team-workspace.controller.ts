/**
 * Team Workspace Controller
 * 
 * API endpoints for Team Lead Layer
 * Routes: /api/team/*
 */

import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeamWorkspaceService } from './team-workspace.service';

@Controller('team')
@UseGuards(JwtAuthGuard)
export class TeamWorkspaceController {
  constructor(private readonly teamService: TeamWorkspaceService) {}

  /**
   * GET /api/team/dashboard
   * Team Lead Dashboard KPIs
   */
  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    return this.teamService.getDashboardKPIs(req.user);
  }

  /**
   * GET /api/team/managers
   * Manager Load Board
   */
  @Get('managers')
  async getManagers(@Query('status') status?: string) {
    return this.teamService.getManagersWithStats(status);
  }

  /**
   * GET /api/team/managers/:id
   * Manager Profile
   */
  @Get('managers/:id')
  async getManagerProfile(@Param('id') id: string) {
    return this.teamService.getManagerProfile(id);
  }

  /**
   * GET /api/team/alerts
   * Team Alerts Feed
   */
  @Get('alerts')
  async getAlerts(@Query('severity') severity?: string) {
    return this.teamService.getAlerts(severity);
  }

  /**
   * GET /api/team/payments/overdue
   * Overdue Payments Watch
   */
  @Get('payments/overdue')
  async getOverduePayments() {
    return this.teamService.getOverduePayments();
  }

  /**
   * GET /api/team/shipping/stalled
   * Stalled Shipments Watch
   */
  @Get('shipping/stalled')
  async getStalledShipments() {
    return this.teamService.getStalledShipments();
  }

  /**
   * GET /api/team/performance
   * Team Performance Metrics
   */
  @Get('performance')
  async getPerformance(@Query('period') period?: number) {
    return this.teamService.getPerformanceMetrics(period || 30);
  }

  /**
   * GET /api/team/reassignments
   * Reassignment Queue
   */
  @Get('reassignments')
  async getReassignments() {
    return this.teamService.getReassignmentQueue();
  }
}
