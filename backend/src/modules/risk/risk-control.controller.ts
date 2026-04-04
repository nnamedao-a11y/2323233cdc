/**
 * Risk Control Controller
 * 
 * Routes:
 * GET /api/risk/user/:id        - Assess user risk
 * GET /api/risk/manager/:id     - Assess manager risk
 * GET /api/risk/session/:id     - Assess session risk
 * POST /api/risk/daily-check    - Run daily risk assessment
 */

import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { RiskControlService, RiskAssessment } from './risk-control.service';

@Controller('risk')
export class RiskControlController {
  constructor(private readonly riskService: RiskControlService) {}

  @Get('user/:id')
  async assessUserRisk(@Param('id') userId: string): Promise<RiskAssessment> {
    return this.riskService.assessUserRisk(userId);
  }

  @Get('manager/:id')
  async assessManagerRisk(@Param('id') managerId: string): Promise<RiskAssessment> {
    return this.riskService.assessManagerRisk(managerId);
  }

  @Get('session/:id')
  async assessSessionRisk(
    @Param('id') sessionId: string,
    @Query('userId') userId: string,
    @Query('ip') ip: string,
    @Query('userAgent') userAgent: string
  ): Promise<RiskAssessment> {
    return this.riskService.assessSessionRisk(sessionId, userId, ip, userAgent);
  }

  @Post('daily-check')
  async runDailyCheck() {
    return this.riskService.runDailyRiskAssessment();
  }
}
