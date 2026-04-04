import { 
  Controller, 
  Get, 
  Patch,
  Param, 
  Body,
  Req, 
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StaffSessionService } from '../services/staff-session.service';
import { TerminateSessionDto } from '../dto/staff-auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../shared/enums';

@Controller('staff-sessions')
@UseGuards(JwtAuthGuard)
export class StaffSessionController {
  constructor(private readonly sessionService: StaffSessionService) {}

  /**
   * GET /api/staff-sessions
   * Get all active sessions (owner sees all, team_lead sees team)
   */
  @Get()
  async getSessions(@Req() req: any) {
    const user = req.user;

    if (user.role === 'owner' || user.role === 'master_admin') {
      return this.sessionService.getSessionsForOwner();
    }

    if (user.role === 'team_lead') {
      return this.sessionService.getSessionsForTeamLead(user.id);
    }

    // Manager sees only own sessions
    return this.sessionService.getSessionHistory(user.id, 10);
  }

  /**
   * GET /api/staff-sessions/analytics
   * Session analytics for owner
   */
  @Get('analytics')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async getAnalytics() {
    return this.sessionService.getSessionAnalytics();
  }

  /**
   * GET /api/staff-sessions/history
   * Session history
   */
  @Get('history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getHistory(@Req() req: any) {
    if (req.user.role === 'owner' || req.user.role === 'master_admin') {
      return this.sessionService.getSessionHistory(undefined, 100);
    }
    // Team lead sees own team history
    return this.sessionService.getSessionHistory(undefined, 50);
  }

  /**
   * PATCH /api/staff-sessions/:sessionToken/terminate
   * Terminate a specific session
   */
  @Patch(':sessionToken/terminate')
  @HttpCode(HttpStatus.OK)
  async terminateSession(
    @Param('sessionToken') sessionToken: string,
    @Body() dto: TerminateSessionDto,
    @Req() req: any,
  ) {
    const user = req.user;

    // Get the target session first
    const session = await this.sessionService['sessionModel'].findOne({ sessionToken });
    
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    // Check permissions:
    // - Owner can terminate any session
    // - Team lead can terminate their team's sessions
    // - Manager can only terminate own sessions
    if (user.role === 'manager' && session.userId !== user.id) {
      return { success: false, message: 'Cannot terminate other users sessions' };
    }

    if (user.role === 'team_lead' && session.teamLeadId !== user.id && session.userId !== user.id) {
      return { success: false, message: 'Cannot terminate sessions outside your team' };
    }

    const terminated = await this.sessionService.terminateSession(
      sessionToken,
      user.id,
      dto.reason || 'manual_termination',
    );

    return { 
      success: true, 
      message: `Session terminated for ${terminated.email}`,
      session: terminated,
    };
  }

  /**
   * PATCH /api/staff-sessions/user/:userId/terminate-all
   * Terminate all sessions for a user
   */
  @Patch('user/:userId/terminate-all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async terminateAllUserSessions(
    @Param('userId') userId: string,
    @Body() dto: TerminateSessionDto,
    @Req() req: any,
  ) {
    const count = await this.sessionService.terminateAllUserSessions(
      userId,
      req.user.id,
      dto.reason || 'all_sessions_terminated',
    );

    return { 
      success: true, 
      message: `Terminated ${count} sessions`,
      count,
    };
  }

  /**
   * POST /api/staff-sessions/touch
   * Update lastSeenAt for current session
   */
  @Patch('touch')
  @HttpCode(HttpStatus.OK)
  async touchSession(@Req() req: any) {
    const sessionToken = req.headers['x-session-token'];
    if (sessionToken) {
      await this.sessionService.touchSession(sessionToken);
    }
    return { success: true };
  }
}
