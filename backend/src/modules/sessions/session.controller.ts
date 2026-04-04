/**
 * Session Controller
 * 
 * Admin endpoints for session management
 */

import { Controller, Get, Post, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('admin/sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  /**
   * Get all sessions
   */
  @Get()
  @Roles(UserRole.OWNER)
  async getAllSessions(
    @Query('role') role?: string,
    @Query('active') active?: string,
  ) {
    const isActive = active === 'true' ? true : active === 'false' ? false : undefined;
    return this.sessionService.getAllSessions({ role, isActive });
  }

  /**
   * Get session statistics
   */
  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getStats() {
    return this.sessionService.getStats();
  }

  /**
   * Terminate single session
   */
  @Post(':sessionId/terminate')
  @Roles(UserRole.OWNER)
  async terminateSession(
    @Param('sessionId') sessionId: string,
    @Req() req: any,
  ) {
    const success = await this.sessionService.terminateSession(
      sessionId,
      req.user?.id || 'admin',
      'Admin terminated',
    );
    return { success };
  }

  /**
   * Terminate all sessions for user
   */
  @Post('user/:userId/terminate-all')
  @Roles(UserRole.OWNER)
  async terminateUserSessions(
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    const count = await this.sessionService.terminateUserSessions(
      userId,
      req.user?.id || 'admin',
    );
    return { success: true, terminatedCount: count };
  }

  /**
   * Force daily reset (manual trigger)
   */
  @Post('reset-managers')
  @Roles(UserRole.OWNER)
  async forceResetManagers() {
    await this.sessionService.resetManagerSessions();
    return { success: true, message: 'Manager sessions reset' };
  }
}
