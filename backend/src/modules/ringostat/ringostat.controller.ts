/**
 * Ringostat Controller
 * 
 * Routes:
 * POST /api/ringostat/webhook        - Receive Ringostat events
 * GET  /api/calls/board              - Call board for managers
 * GET  /api/calls/analytics          - Call analytics
 * GET  /api/calls/lead/:leadId       - Calls for specific lead
 * GET  /api/calls/follow-up          - Calls needing follow-up
 * PATCH /api/calls/:id               - Update call (note, outcome, etc)
 */

import { Controller, Get, Post, Patch, Body, Param, Query, Req, Headers, ForbiddenException, Logger } from '@nestjs/common';
import { RingostatService, RingostatWebhookDto } from './ringostat.service';

// Ringostat webhook source IP whitelist (update with actual IPs)
const RINGOSTAT_IP_WHITELIST = [
  '185.106.92.0/24',  // Ringostat range (example)
  '127.0.0.1',        // localhost for testing
  '::1',              // IPv6 localhost
];

@Controller()
export class RingostatController {
  private readonly logger = new Logger(RingostatController.name);

  constructor(private readonly ringostatService: RingostatService) {}

  /**
   * Verify request comes from Ringostat
   */
  private verifyRingostatSource(req: any): boolean {
    const ip = req.ip || req.connection?.remoteAddress || '';
    
    // In development, allow all
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }

    // Check IP whitelist
    for (const allowed of RINGOSTAT_IP_WHITELIST) {
      if (ip.includes(allowed.split('/')[0])) {
        return true;
      }
    }

    this.logger.warn(`Ringostat webhook rejected from IP: ${ip}`);
    return false;
  }

  // === WEBHOOK ===
  
  @Post('ringostat/webhook')
  async handleWebhook(
    @Body() data: RingostatWebhookDto,
    @Headers('x-ringostat-signature') signature?: string,
    @Req() req?: any,
  ) {
    // Verify source IP
    if (!this.verifyRingostatSource(req)) {
      throw new ForbiddenException('Invalid webhook source');
    }

    const result = await this.ringostatService.handleWebhook(data);
    return { status: 'ok', callId: result?.id };
  }

  // === CALL BOARD ===
  
  @Get('calls/board')
  async getCallBoard(
    @Query('managerId') managerId?: string,
    @Query('teamId') teamId?: string,
    @Req() req?: any
  ) {
    // If no managerId specified, use current user's ID
    const userId = managerId || req?.user?.id;
    return this.ringostatService.getCallBoard(userId, teamId);
  }

  // === ANALYTICS ===
  
  @Get('calls/analytics')
  async getAnalytics(
    @Query('managerId') managerId?: string,
    @Query('period') period?: string
  ) {
    const periodDays = parseInt(period || '7', 10);
    return this.ringostatService.getCallAnalytics(managerId, periodDays);
  }

  // === CALLS FOR LEAD ===
  
  @Get('calls/lead/:leadId')
  async getCallsForLead(@Param('leadId') leadId: string) {
    return this.ringostatService.getCallsForLead(leadId);
  }

  // === FOLLOW-UP NEEDED ===
  
  @Get('calls/follow-up')
  async getFollowUp(@Query('managerId') managerId?: string, @Req() req?: any) {
    const userId = managerId || req?.user?.id;
    return this.ringostatService.getCallsNeedingFollowUp(userId);
  }

  // === UPDATE CALL ===
  
  @Patch('calls/:id')
  async updateCall(
    @Param('id') id: string,
    @Body() body: {
      note?: string;
      outcome?: string;
      nextActionAt?: string;
      nextActionType?: string;
      qualityScore?: number;
      isProcessed?: boolean;
    }
  ) {
    return this.ringostatService.updateCall(id, {
      ...body,
      nextActionAt: body.nextActionAt ? new Date(body.nextActionAt) : undefined,
    });
  }

  // === TEAM CALLS (FOR TEAM LEAD) ===
  
  @Get('calls/team')
  async getTeamCalls(@Query('period') period?: string) {
    const periodDays = parseInt(period || '7', 10);
    // Get all calls (no filter = team view)
    return this.ringostatService.getCallBoard(undefined, undefined);
  }

  // === TEAM ANALYTICS ===
  
  @Get('calls/team/analytics')
  async getTeamAnalytics(@Query('period') period?: string) {
    const periodDays = parseInt(period || '7', 10);
    return this.ringostatService.getCallAnalytics(undefined, periodDays);
  }
}
