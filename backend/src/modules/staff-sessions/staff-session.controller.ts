import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, Headers } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffSessionService } from './staff-session.service';
import { UserRole } from '../../shared/enums';

// Helper to check roles including legacy ones
const isOwner = (role: string) => role === UserRole.OWNER || role === 'master_admin' || role === 'finance';
const isTeamLead = (role: string) => role === UserRole.TEAM_LEAD || role === 'admin' || role === 'moderator';

@Controller('admin/staff-sessions')
@UseGuards(JwtAuthGuard)
export class StaffSessionController {
  constructor(private readonly service: StaffSessionService) {}

  // === LOGIN ALERTS (for Team Lead Panel) ===

  @Get('login-alerts')
  async getLoginAlerts(
    @Req() req: any,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    const limitNum = parseInt(limit || '10');

    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied. Owner/Team Lead only.' };
    }

    return this.service.getLoginAlerts(limitNum);
  }

  // === 2FA SETUP ===

  @Post('2fa/setup')
  async setup2FA(@Req() req: any) {
    const user = req.user;
    return this.service.setup2FA(user.id);
  }

  @Post('2fa/verify')
  async verify2FA(
    @Req() req: any,
    @Body() body: { token: string; sessionId: string },
  ) {
    const user = req.user;
    const verified = await this.service.verify2FA(user.id, body.token, body.sessionId);
    return { verified };
  }

  // === ACTIVE SESSIONS ===

  @Get('active')
  async getActiveSessions(@Req() req: any) {
    const user = req.user;

    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied. Owner/Team Lead only.' };
    }

    return this.service.getActiveSessions();
  }

  // === MY SESSIONS ===

  @Get('my-sessions')
  async getMySessions(@Req() req: any) {
    const user = req.user;
    return this.service.getUserSessions(user.id);
  }

  // === USER SESSIONS (Admin) ===

  @Get('user/:userId')
  async getUserSessions(
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    const user = req.user;

    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied' };
    }

    return this.service.getUserSessions(userId);
  }

  // === SUSPICIOUS SESSIONS ===

  @Get('suspicious')
  async getSuspiciousSessions(@Req() req: any) {
    const user = req.user;

    if (!isOwner(user.role)) {
      return { error: 'Access denied. Owner only.' };
    }

    return this.service.getSuspiciousSessions();
  }

  // === FORCE LOGOUT SINGLE SESSION ===

  @Post('force-logout/:sessionId')
  async forceLogout(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: { reason: string },
  ) {
    const user = req.user;

    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied' };
    }

    await this.service.forceLogout(sessionId, user.id, body.reason);
    return { success: true };
  }

  // === FORCE LOGOUT ALL USER SESSIONS ===

  @Delete('force-logout-user/:userId')
  async forceLogoutUser(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { reason: string },
  ) {
    const user = req.user;

    if (!isOwner(user.role)) {
      return { error: 'Access denied. Owner only.' };
    }

    const count = await this.service.forceLogoutUser(userId, user.id, body.reason);
    return { success: true, sessionsEnded: count };
  }

  // === END MY SESSION (Logout) ===

  @Post('logout')
  async logout(
    @Req() req: any,
    @Body() body: { sessionId: string },
  ) {
    const user = req.user;
    await this.service.endSession(body.sessionId, 'user_logout');
    return { success: true };
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

    const periodDays = parseInt(period || '30');
    return this.service.getSessionAnalytics(periodDays);
  }

  // === CLEANUP EXPIRED ===

  @Post('cleanup')
  async cleanupExpired(@Req() req: any) {
    const user = req.user;

    if (!isOwner(user.role)) {
      return { error: 'Access denied. Owner only.' };
    }

    const count = await this.service.cleanupExpiredSessions();
    return { cleanedUp: count };
  }
}
