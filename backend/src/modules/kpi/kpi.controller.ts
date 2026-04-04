import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KPIService } from './kpi.service';
import { UserRole } from '../../shared/enums';

// Helper to check roles including legacy ones
const isOwner = (role: string) => role === UserRole.OWNER || role === 'master_admin' || role === 'finance';
const isTeamLead = (role: string) => role === UserRole.TEAM_LEAD || role === 'admin' || role === 'moderator';
const isManager = (role: string) => role === UserRole.MANAGER;

@Controller('admin/kpi')
@UseGuards(JwtAuthGuard)
export class KPIController {
  constructor(private readonly kpiService: KPIService) {}

  // === TEAM SUMMARY (for Team Lead Panel) ===
  @Get('team-summary')
  async getTeamSummary(
    @Req() req: any,
    @Query('period') period?: string,
  ) {
    const periodDays = parseInt(period || '7');
    const user = req.user;

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const summary = await this.kpiService.getTeamSummary(periodDays);
      return summary;
    } catch (error) {
      // Return mock data if service fails
      return {
        leadsToday: 0,
        leadsChange: '+0%',
        activeDeals: 0,
        completedDeals: 0,
        callsToday: 0,
        missedCalls: 0,
        activeManagers: 0,
        totalManagers: 0,
      };
    }
  }

  // Get KPI for specific manager
  @Get('manager/:id')
  async getManagerKPI(
    @Req() req: any,
    @Param('id') managerId: string,
    @Query('period') period?: string,
  ) {
    const periodDays = parseInt(period || '30');
    const user = req.user;

    // Access control
    if (isManager(user.role) && user.id !== managerId) {
      return { error: 'Access denied' };
    }

    return this.kpiService.getManagerKPI(managerId, periodDays);
  }

  // Get KPI for current user (manager sees own, team lead sees team)
  @Get('me')
  async getMyKPI(
    @Req() req: any,
    @Query('period') period?: string,
  ) {
    const periodDays = parseInt(period || '30');
    const user = req.user;

    if (isManager(user.role)) {
      return this.kpiService.getManagerKPI(user.id, periodDays);
    }

    if (isTeamLead(user.role)) {
      return this.kpiService.getTeamKPI(user.id, periodDays);
    }

    if (isOwner(user.role)) {
      return this.kpiService.getOwnerDashboard(periodDays);
    }

    return { error: 'Unknown role' };
  }

  // Get team KPI (for team leads)
  @Get('team')
  async getTeamKPI(
    @Req() req: any,
    @Query('period') period?: string,
  ) {
    const periodDays = parseInt(period || '30');
    const user = req.user;

    if (isManager(user.role)) {
      return { error: 'Access denied. Team Leads only.' };
    }

    if (isTeamLead(user.role)) {
      return this.kpiService.getTeamKPI(user.id, periodDays);
    }

    // Owner can see all
    if (isOwner(user.role)) {
      return this.kpiService.getOwnerDashboard(periodDays);
    }

    return { error: 'Access denied' };
  }

  // Get owner dashboard (full overview)
  @Get('dashboard')
  async getOwnerDashboard(
    @Req() req: any,
    @Query('period') period?: string,
  ) {
    const periodDays = parseInt(period || '30');
    const user = req.user;

    if (!isOwner(user.role)) {
      return { error: 'Access denied. Owner only.' };
    }

    return this.kpiService.getOwnerDashboard(periodDays);
  }

  // Get leaderboard
  @Get('leaderboard')
  async getLeaderboard(
    @Query('limit') limit?: string,
    @Query('period') period?: string,
  ) {
    const limitNum = parseInt(limit || '10');
    const periodDays = parseInt(period || '30');
    
    // This is public for motivation
    const dashboard = await this.kpiService.getOwnerDashboard(periodDays);
    return dashboard.leaderboard;
  }

  // Get alerts for managers needing attention
  @Get('alerts')
  async getAlerts(@Req() req: any) {
    const user = req.user;
    
    if (isManager(user.role)) {
      const kpi = await this.kpiService.getManagerKPI(user.id);
      return { alerts: kpi.alerts };
    }

    if (isTeamLead(user.role)) {
      const team = await this.kpiService.getTeamKPI(user.id);
      return { 
        needsAttention: team.needsAttention,
        criticalCount: team.summary.criticalAlerts,
      };
    }

    if (isOwner(user.role)) {
      const dashboard = await this.kpiService.getOwnerDashboard();
      return {
        needsAttention: dashboard.needsAttention,
        criticalCount: dashboard.totals.criticalAlerts,
      };
    }

    return { alerts: [] };
  }
}
