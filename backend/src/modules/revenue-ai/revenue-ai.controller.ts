import { Controller, Get, Post, Query, Body, Logger } from '@nestjs/common';
import { IntentScoringService } from './intent-scoring.service';
import { DynamicPricingService, PriceContext } from './dynamic-pricing.service';
import { ManagerAiAssistService } from './manager-ai-assist.service';

/**
 * Revenue AI Controller
 * 
 * API for revenue optimization features
 */
@Controller('revenue-ai')
export class RevenueAiController {
  private readonly logger = new Logger(RevenueAiController.name);

  constructor(
    private readonly intentService: IntentScoringService,
    private readonly pricingService: DynamicPricingService,
    private readonly managerAiService: ManagerAiAssistService,
  ) {}

  /**
   * Service status
   */
  @Get('status')
  async getStatus() {
    return {
      ok: true,
      service: 'revenue-ai',
      version: '1.0.0',
      features: [
        'intent_scoring',
        'dynamic_pricing',
        'manager_ai_assist',
        'discount_recommendations',
        'deal_closing_logic',
      ],
    };
  }

  /**
   * Get user intent score
   * GET /api/revenue-ai/intent?customerId=xxx
   */
  @Get('intent')
  async getIntent(@Query('customerId') customerId: string) {
    if (!customerId) {
      return { success: false, error: 'customerId required' };
    }

    const intent = await this.intentService.getIntentScore(customerId);
    
    return {
      success: true,
      data: intent,
    };
  }

  /**
   * Calculate dynamic price
   * POST /api/revenue-ai/price
   */
  @Post('price')
  async calculatePrice(@Body() body: PriceContext) {
    if (!body.basePrice) {
      return { success: false, error: 'basePrice required' };
    }

    const result = await this.pricingService.getDynamicPrice(body);
    
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Get optimal margin
   * GET /api/revenue-ai/margin?customerId=xxx
   */
  @Get('margin')
  async getOptimalMargin(@Query('customerId') customerId: string) {
    if (!customerId) {
      return { success: false, error: 'customerId required' };
    }

    const margin = await this.pricingService.getOptimalMargin(customerId);
    
    return {
      success: true,
      data: {
        customerId,
        optimalMarginMultiplier: margin,
        optimalMarginPercent: `${((margin - 1) * 100).toFixed(0)}%`,
      },
    };
  }

  /**
   * Get discount recommendation
   * GET /api/revenue-ai/discount?customerId=xxx&price=10000&hoursWithoutResponse=48
   */
  @Get('discount')
  async getDiscount(
    @Query('customerId') customerId: string,
    @Query('price') price: string,
    @Query('hoursWithoutResponse') hours: string,
  ) {
    if (!customerId || !price) {
      return { success: false, error: 'customerId and price required' };
    }

    const recommendation = await this.pricingService.getDiscountRecommendation(
      customerId,
      parseFloat(price),
      parseFloat(hours || '0'),
    );
    
    return {
      success: true,
      data: recommendation,
    };
  }

  /**
   * Get deal advice
   * GET /api/revenue-ai/deal-advice?dealId=xxx
   */
  @Get('deal-advice')
  async getDealAdvice(@Query('dealId') dealId: string) {
    if (!dealId) {
      return { success: false, error: 'dealId required' };
    }

    const analysis = await this.managerAiService.getDealAdvice(dealId);
    
    if (!analysis) {
      return { success: false, error: 'Deal not found' };
    }
    
    return {
      success: true,
      data: analysis,
    };
  }

  /**
   * Get manager dashboard with AI advice for all deals
   * GET /api/revenue-ai/manager-dashboard?managerId=xxx
   */
  @Get('manager-dashboard')
  async getManagerDashboard(@Query('managerId') managerId: string) {
    if (!managerId) {
      return { success: false, error: 'managerId required' };
    }

    const analyses = await this.managerAiService.getManagerDashboard(managerId);
    
    return {
      success: true,
      data: analyses,
      summary: {
        total: analyses.length,
        highPriority: analyses.filter(a => a.advice.priority === 'high').length,
        mediumPriority: analyses.filter(a => a.advice.priority === 'medium').length,
        lowPriority: analyses.filter(a => a.advice.priority === 'low').length,
      },
    };
  }

  /**
   * Get urgency message for deal
   * GET /api/revenue-ai/urgency-message?dealId=xxx&auctionHoursLeft=6
   */
  @Get('urgency-message')
  async getUrgencyMessage(
    @Query('dealId') dealId: string,
    @Query('auctionHoursLeft') hours: string,
  ) {
    if (!dealId || !hours) {
      return { success: false, error: 'dealId and auctionHoursLeft required' };
    }

    const message = await this.managerAiService.getUrgencyMessage(dealId, parseFloat(hours));
    
    return {
      success: true,
      data: {
        dealId,
        auctionHoursLeft: parseFloat(hours),
        message,
        shouldSend: !!message,
      },
    };
  }
}
