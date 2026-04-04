import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PredictiveLeadService } from './predictive-lead.service';
import { LeadSignals } from './services/predictive-score.service';
import { UserRole } from '../../shared/enums';

@Controller('admin/predictive-leads')
@UseGuards(JwtAuthGuard)
export class PredictiveLeadController {
  constructor(private readonly service: PredictiveLeadService) {}

  // Evaluate specific lead
  @Get('evaluate/:id')
  async evaluateLead(@Param('id') leadId: string) {
    return this.service.evaluateLead(leadId);
  }

  // Evaluate by signals (for testing/preview)
  @Post('evaluate')
  async evaluateBySignals(@Body() signals: LeadSignals) {
    return this.service.evaluateLeadBySignals(signals);
  }

  // Get top prioritized leads for current user
  @Get('top')
  async getTopLeads(
    @Req() req: any,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    const limitNum = parseInt(limit || '20');

    if (user.role === UserRole.MANAGER) {
      return this.service.getTopLeads(user.id, limitNum);
    }

    // Team lead or owner - all hot leads
    return this.service.getHotLeads(undefined, limitNum);
  }

  // Get HOT leads only
  @Get('hot')
  async getHotLeads(
    @Req() req: any,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    const limitNum = parseInt(limit || '20');

    if (user.role === UserRole.MANAGER) {
      return this.service.getHotLeads(user.id, limitNum);
    }

    return this.service.getHotLeads(undefined, limitNum);
  }

  // Get leads needing immediate action
  @Get('action-required')
  async getLeadsNeedingAction(@Req() req: any) {
    const user = req.user;

    if (user.role !== UserRole.MANAGER) {
      return { error: 'This endpoint is for managers only' };
    }

    return this.service.getLeadsNeedingAction(user.id);
  }

  // Get leads by bucket
  @Get('bucket/:bucket')
  async getLeadsByBucket(
    @Param('bucket') bucket: 'hot' | 'warm' | 'cold',
    @Req() req: any,
  ) {
    const user = req.user;

    if (!['hot', 'warm', 'cold'].includes(bucket)) {
      return { error: 'Invalid bucket. Use: hot, warm, cold' };
    }

    if (user.role === UserRole.MANAGER) {
      return this.service.getLeadsByBucket(user.id, bucket);
    }

    // For team lead/owner - would need to aggregate across managers
    return { error: 'Use manager-specific endpoint for non-managers' };
  }
}
