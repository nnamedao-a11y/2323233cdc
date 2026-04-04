import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffActivityService } from './staff-activity.service';
import { ActivityType } from './staff-activity.schema';
import { UserRole } from '../../shared/enums';

// Helper to check roles
const isOwner = (role: string) => role === UserRole.OWNER || role === 'master_admin' || role === 'finance';
const isTeamLead = (role: string) => role === UserRole.TEAM_LEAD || role === 'admin' || role === 'moderator';
const isManager = (role: string) => role === UserRole.MANAGER;

@Controller('admin/staff-activity')
@UseGuards(JwtAuthGuard)
export class StaffActivityController {
  constructor(private readonly service: StaffActivityService) {}

  // === LOG ACTIVITY (called by other services) ===

  @Post('log')
  async logActivity(
    @Req() req: any,
    @Body() body: {
      type: ActivityType;
      entityType?: string;
      entityId?: string;
      metadata?: any;
      duration?: number;
    },
  ) {
    const user = req.user;
    
    return this.service.logActivity(
      user.id,
      body.type,
      undefined, // sessionId can be passed
      body.entityType,
      body.entityId,
      body.metadata,
      body.duration,
      req.ip,
    );
  }

  // === MANAGER HEALTH CARD ===

  @Get('health/:managerId')
  async getManagerHealth(
    @Req() req: any,
    @Param('managerId') managerId: string,
  ) {
    const user = req.user;

    // Manager can see own health
    if (isManager(user.role) && user.id !== managerId) {
      return { error: 'Access denied' };
    }

    return this.service.getManagerHealthCard(managerId);
  }

  // === MY HEALTH ===

  @Get('my-health')
  async getMyHealth(@Req() req: any) {
    const user = req.user;
    return this.service.getManagerHealthCard(user.id);
  }

  // === TEAM HEALTH (Team Lead) ===

  @Get('team-health')
  async getTeamHealth(@Req() req: any) {
    const user = req.user;

    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied. Team Lead/Owner only.' };
    }

    // Get all managers (for owner) or team managers (for team lead)
    // For simplicity, return all managers for now
    // In production, filter by teamLeadId
    
    // Placeholder - should be fetched from user service
    const User = require('../users/user.schema').User;
    const { InjectModel } = require('@nestjs/mongoose');
    
    return { message: 'Team health endpoint - implement with user filtering' };
  }

  // === DETECT PROBLEMS ===

  @Get('problems/:managerId')
  async detectProblems(
    @Req() req: any,
    @Param('managerId') managerId: string,
  ) {
    const user = req.user;

    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied' };
    }

    return this.service.detectProblems(managerId);
  }

  // === MY PROBLEMS ===

  @Get('my-problems')
  async getMyProblems(@Req() req: any) {
    const user = req.user;
    return this.service.detectProblems(user.id);
  }

  // === ACTIVITY TIMELINE ===

  @Get('timeline/:managerId')
  async getTimeline(
    @Req() req: any,
    @Param('managerId') managerId: string,
    @Query('hours') hours?: string,
  ) {
    const user = req.user;

    // Manager can see own timeline
    if (isManager(user.role) && user.id !== managerId) {
      return { error: 'Access denied' };
    }

    const hoursNum = parseInt(hours || '24');
    return this.service.getActivityTimeline(managerId, hoursNum);
  }

  // === ANALYTICS ===

  @Get('analytics')
  async getAnalytics(
    @Req() req: any,
    @Query('period') period?: string,
  ) {
    const user = req.user;

    if (!isOwner(user.role)) {
      return { error: 'Access denied. Owner only.' };
    }

    const periodDays = parseInt(period || '7');
    return this.service.getActivityAnalytics(periodDays);
  }
}
