/**
 * Engagement Campaign Controller
 * 
 * Admin API для масових розсилок
 */

import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { EngagementCampaignService, CAMPAIGN_TEMPLATES } from './engagement-campaign.service';
import { CreateCampaignDto, CampaignTemplateDto } from './dto/campaign.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('admin/engagement')
@UseGuards(JwtAuthGuard)
export class EngagementCampaignController {
  constructor(private readonly campaignService: EngagementCampaignService) {}

  /**
   * Топ авто по інтересу (favorites + compare)
   * GET /api/admin/engagement/top-vehicles
   */
  @Get('top-vehicles')
  async getTopVehicles(@Query('limit') limit = '50') {
    return this.campaignService.getTopVehicles(parseInt(limit, 10));
  }

  /**
   * Топ користувачів по активності
   * GET /api/admin/engagement/top-users
   */
  @Get('top-users')
  async getTopUsers(@Query('limit') limit = '50') {
    return this.campaignService.getTopUsers(parseInt(limit, 10));
  }

  /**
   * Статистика по конкретному VIN
   * GET /api/admin/engagement/vin-stats?vin=XXX
   */
  @Get('vin-stats')
  async getVinStats(@Query('vin') vin: string) {
    if (!vin) return { error: 'VIN required' };
    return this.campaignService.getVinStats(vin.trim().toUpperCase());
  }

  /**
   * Цільова аудиторія для VIN (preview перед розсилкою)
   * GET /api/admin/engagement/audience?vin=XXX&intentMin=5
   */
  @Get('audience')
  async getAudience(
    @Query('vin') vin: string,
    @Query('intentMin') intentMin = '0',
    @Query('onlyHot') onlyHot = 'false',
  ) {
    if (!vin) return { error: 'VIN required' };
    
    const users = await this.campaignService.getTargetAudience(
      vin.trim().toUpperCase(),
      {
        favorites: true,
        compare: true,
        intentMin: parseInt(intentMin, 10),
        onlyHot: onlyHot === 'true',
      },
    );

    return {
      vin: vin.trim().toUpperCase(),
      totalUsers: users.length,
      users,
    };
  }

  /**
   * Запустити кампанію
   * POST /api/admin/engagement/campaign
   */
  @Post('campaign')
  async runCampaign(@Body() dto: CreateCampaignDto, @Req() req: any) {
    const createdBy = req.user?.id || req.user?._id || 'admin';
    return this.campaignService.runCampaign(dto, createdBy);
  }

  /**
   * Запустити кампанію по шаблону
   * POST /api/admin/engagement/campaign/template
   */
  @Post('campaign/template')
  async runFromTemplate(@Body() dto: CampaignTemplateDto, @Req() req: any) {
    const createdBy = req.user?.id || req.user?._id || 'admin';
    return this.campaignService.runFromTemplate(dto.templateId, dto.vin, dto.channel as any, createdBy);
  }

  /**
   * Отримати шаблони
   * GET /api/admin/engagement/templates
   */
  @Get('templates')
  getTemplates() {
    return Object.values(CAMPAIGN_TEMPLATES);
  }

  /**
   * Історія кампаній
   * GET /api/admin/engagement/history
   */
  @Get('history')
  async getHistory(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.campaignService.getCampaignHistory(parseInt(page, 10), parseInt(limit, 10));
  }

  /**
   * Загальна аналітика
   * GET /api/admin/engagement/analytics
   */
  @Get('analytics')
  async getAnalytics() {
    return this.campaignService.getAnalytics();
  }
}
