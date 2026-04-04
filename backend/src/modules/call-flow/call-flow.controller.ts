import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CallFlowManagementService, UpdateCallSessionDto } from './call-flow-management.service';
import { UserRole } from '../../shared/enums';

@Controller('admin/call-flow')
@UseGuards(JwtAuthGuard)
export class CallFlowController {
  constructor(private readonly service: CallFlowManagementService) {}

  // Get or create session for lead
  @Post('session/:leadId')
  async getOrCreateSession(
    @Req() req: any,
    @Param('leadId') leadId: string,
  ) {
    const user = req.user;
    return this.service.getOrCreateSession(leadId, user.id);
  }

  // Update session after call
  @Put('session/:sessionId')
  async updateSession(
    @Req() req: any,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateCallSessionDto,
  ) {
    const user = req.user;
    return this.service.updateSession(sessionId, dto, user.id);
  }

  // Get call board (pipeline view)
  @Get('board')
  async getCallBoard(@Req() req: any) {
    const user = req.user;

    if (user.role !== UserRole.MANAGER) {
      return { error: 'Call board is for managers only' };
    }

    return this.service.getCallBoard(user.id);
  }

  // Get due actions (reminders)
  @Get('due')
  async getDueActions(@Req() req: any) {
    const user = req.user;

    if (user.role !== UserRole.MANAGER) {
      return { error: 'Due actions are for managers only' };
    }

    return this.service.getDueActions(user.id);
  }

  // Get call stats
  @Get('stats')
  async getCallStats(
    @Req() req: any,
    @Query('period') period?: string,
  ) {
    const user = req.user;
    const periodDays = parseInt(period || '30');

    if (user.role !== UserRole.MANAGER) {
      return { error: 'Stats are for managers only' };
    }

    return this.service.getCallStats(user.id, periodDays);
  }
}
