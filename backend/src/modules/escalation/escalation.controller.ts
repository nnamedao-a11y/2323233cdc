import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { EscalationService } from './escalation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../../shared/enums';

// Role helpers
const isOwner = (role: string) => role === UserRole.OWNER || role === 'master_admin';
const isTeamLead = (role: string) => role === UserRole.TEAM_LEAD || role === 'admin';
const isManager = (role: string) => role === UserRole.MANAGER;

@Controller('escalations')
@UseGuards(JwtAuthGuard)
export class EscalationController {
  constructor(private readonly escalationService: EscalationService) {}

  @Get()
  async getActiveEscalations(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('entityType') entityType?: string,
  ) {
    const user = req.user;
    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied', escalations: [] };
    }
    return this.escalationService.getActiveEscalations({ status, entityType });
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    const user = req.user;
    if (!isOwner(user.role) && !isTeamLead(user.role)) {
      return { error: 'Access denied' };
    }
    return this.escalationService.getEscalationStats();
  }

  @Patch(':id/resolve')
  async resolveEscalation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { eventType: string; entityId: string; reason?: string },
  ) {
    return this.escalationService.resolveEscalation({
      eventType: body.eventType,
      entityId: body.entityId,
      userId: req.user.id,
      reason: body.reason,
    });
  }

  @Post('process')
  async triggerProcessing(@Req() req: any) {
    const user = req.user;
    if (!isOwner(user.role)) {
      return { error: 'Only owner can trigger manual processing' };
    }
    return this.escalationService.processEscalations();
  }
}
