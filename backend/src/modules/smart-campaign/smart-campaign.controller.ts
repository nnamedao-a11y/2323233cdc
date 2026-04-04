/**
 * Smart Campaign Controller
 * 
 * API для AI-powered кампаній
 */

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SmartCampaignService, SmartCampaignOptions } from './smart-campaign.service';
import { AutoCampaignService } from './services/auto-campaign.service';
import { CampaignFeedbackService } from './services/campaign-feedback.service';
import { AudienceService } from './services/audience.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin/smart-campaign')
@UseGuards(JwtAuthGuard)
export class SmartCampaignController {
  constructor(
    private readonly smartCampaignService: SmartCampaignService,
    private readonly autoCampaignService: AutoCampaignService,
    private readonly feedbackService: CampaignFeedbackService,
    private readonly audienceService: AudienceService,
  ) {}

  /**
   * Запустити smart campaign
   * POST /api/admin/smart-campaign/run
   */
  @Post('run')
  async runCampaign(@Body() options: SmartCampaignOptions) {
    return this.smartCampaignService.runSmartCampaign(options, 'admin');
  }

  /**
   * Preview кампанії
   * POST /api/admin/smart-campaign/preview
   */
  @Post('preview')
  async previewCampaign(@Body() options: SmartCampaignOptions) {
    return this.smartCampaignService.previewCampaign(options);
  }

  /**
   * Ручний запуск авто-кампаній
   * POST /api/admin/smart-campaign/trigger
   */
  @Post('trigger')
  async triggerAutoCampaign(@Body() body: { trigger: string; vin?: string; urgent?: boolean }) {
    return this.autoCampaignService.triggerManualCampaign(body.trigger, {
      vin: body.vin,
      urgent: body.urgent,
    });
  }

  /**
   * Статистика
   * GET /api/admin/smart-campaign/stats
   */
  @Get('stats')
  async getStats() {
    return this.smartCampaignService.getStats();
  }

  /**
   * Статистика авто-кампаній
   * GET /api/admin/smart-campaign/auto-stats
   */
  @Get('auto-stats')
  async getAutoStats() {
    return this.autoCampaignService.getAutoCampaignStats();
  }

  /**
   * Історія кампаній
   * GET /api/admin/smart-campaign/history
   */
  @Get('history')
  async getHistory(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.smartCampaignService.getHistory(parseInt(page, 10), parseInt(limit, 10));
  }

  /**
   * Feedback статистика
   * GET /api/admin/smart-campaign/feedback
   */
  @Get('feedback')
  async getFeedbackStats() {
    return this.feedbackService.getOverallStats();
  }

  /**
   * Патерни успішних кампаній
   * GET /api/admin/smart-campaign/patterns
   */
  @Get('patterns')
  async getSuccessPatterns() {
    return this.feedbackService.getSuccessPatterns();
  }

  /**
   * Ефективність каналів
   * GET /api/admin/smart-campaign/channels
   */
  @Get('channels')
  async getChannelEffectiveness() {
    return this.feedbackService.getChannelEffectiveness();
  }

  /**
   * Статистика аудиторії
   * GET /api/admin/smart-campaign/audience
   */
  @Get('audience')
  async getAudienceStats() {
    return this.audienceService.getAudienceStats();
  }

  /**
   * Записати feedback
   * POST /api/admin/smart-campaign/feedback
   */
  @Post('feedback')
  async recordFeedback(@Body() body: {
    campaignLogId: string;
    userId: string;
    vin?: string;
    event: 'opened' | 'clicked' | 'replied' | 'became_hot' | 'became_lead' | 'became_deal' | 'became_deposit';
    value?: number;
  }) {
    await this.feedbackService.recordFeedback(body);
    return { success: true };
  }
}
