/**
 * Revenue Advisor Controller
 * 
 * API для рекомендацій знижок
 */

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RevenueAdvisorService, AdvisorInput } from './revenue-advisor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin/revenue-advisor')
@UseGuards(JwtAuthGuard)
export class RevenueAdvisorController {
  constructor(private readonly advisorService: RevenueAdvisorService) {}

  /**
   * Отримати рекомендацію
   * POST /api/admin/revenue-advisor/advice
   */
  @Post('advice')
  async getAdvice(@Body() input: AdvisorInput) {
    return this.advisorService.getAdvice(input);
  }

  /**
   * Записати результат
   * POST /api/admin/revenue-advisor/outcome
   */
  @Post('outcome')
  async recordOutcome(@Body() body: {
    leadId: string;
    actionTaken?: string;
    actualDiscount?: number;
    wasContacted?: boolean;
    becameQualified?: boolean;
    becameDeal?: boolean;
    becameDeposit?: boolean;
    dealValue?: number;
    depositValue?: number;
  }) {
    const { leadId, ...outcome } = body;
    return this.advisorService.recordOutcome(leadId, outcome);
  }

  /**
   * Статистика
   * GET /api/admin/revenue-advisor/stats
   */
  @Get('stats')
  async getStats() {
    return this.advisorService.getStats();
  }

  /**
   * Патерни
   * GET /api/admin/revenue-advisor/patterns
   */
  @Get('patterns')
  async getPatterns() {
    return this.advisorService.getPatterns();
  }

  /**
   * Перерахувати патерни
   * POST /api/admin/revenue-advisor/recalculate
   */
  @Post('recalculate')
  async recalculate() {
    await this.advisorService.recalculatePatterns();
    return { success: true, message: 'Patterns recalculated' };
  }
}
