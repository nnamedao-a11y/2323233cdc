/**
 * Calculator Controller
 * 
 * Public API для калькулятора + Admin endpoints
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CalculatorEngineService } from './calculator-engine.service';
import { CalculatorAdminService } from './calculator-admin.service';
import { 
  CalculateDeliveryDto, 
  CreateQuoteDto, 
  UpdateProfileDto, 
  UpsertRouteRateDto,
  UpsertAuctionFeeRuleDto 
} from './dto/calculate-delivery.dto';

@Controller('calculator')
export class CalculatorController {
  constructor(
    private readonly engine: CalculatorEngineService,
    private readonly admin: CalculatorAdminService,
  ) {}

  // ============ PUBLIC API ============

  /**
   * Calculate delivery cost (public)
   */
  @Post('calculate')
  calculate(@Body() dto: CalculateDeliveryDto) {
    return this.engine.calculate(dto);
  }

  /**
   * Create quote with calculation snapshot
   */
  @Post('quote')
  createQuote(@Body() dto: CreateQuoteDto) {
    return this.engine.createQuote(dto);
  }

  /**
   * Get quote by ID
   */
  @Get('quote/:id')
  getQuote(@Param('id') id: string) {
    return this.engine.getQuoteById(id);
  }

  /**
   * Get quotes by VIN
   */
  @Get('quotes/vin/:vin')
  getQuotesByVin(@Param('vin') vin: string) {
    return this.engine.getQuotesByVin(vin);
  }

  /**
   * Get quotes with filters (history)
   */
  @Get('quotes')
  getQuotes(
    @Query('vin') vin?: string,
    @Query('leadId') leadId?: string,
    @Query('customerPhone') customerPhone?: string,
    @Query('limit') limit?: string,
  ) {
    return this.engine.getQuotes({ vin, leadId, customerPhone, limit: limit ? parseInt(limit) : 50 });
  }

  /**
   * Set quote scenario
   */
  @Patch('quote/:id/scenario')
  setScenario(
    @Param('id') id: string,
    @Body() body: { selectedScenario: 'minimum' | 'recommended' | 'aggressive' },
  ) {
    return this.engine.setQuoteScenario(id, body.selectedScenario);
  }

  /**
   * Bind quote to lead
   */
  @Patch('quote/:id/bind-lead')
  bindQuoteToLead(
    @Param('id') id: string,
    @Body() body: { leadId: string; managerId?: string },
  ) {
    return this.engine.bindQuoteToLead(id, body);
  }

  /**
   * Get available ports (for UI dropdown)
   */
  @Get('ports')
  async getPorts() {
    return {
      ports: [
        { code: 'NJ', name: 'New Jersey', popular: true },
        { code: 'GA', name: 'Georgia (Savannah)', popular: true },
        { code: 'TX', name: 'Texas (Houston)', popular: false },
        { code: 'CA', name: 'California (Long Beach)', popular: false },
      ],
      vehicleTypes: [
        { code: 'sedan', name: 'Седан' },
        { code: 'suv', name: 'SUV' },
        { code: 'bigSUV', name: 'Великий SUV / Позашляховик' },
        { code: 'pickup', name: 'Пікап' },
      ],
    };
  }

  // ============ ADMIN API ============

  /**
   * Get active calculator profile
   */
  @Get('config/profile')
  getProfile() {
    return this.admin.getActiveProfile();
  }

  /**
   * Update active profile settings
   */
  @Patch('config/profile')
  updateProfile(@Body() dto: UpdateProfileDto) {
    return this.admin.updateProfile(dto);
  }

  /**
   * Get all profiles
   */
  @Get('config/profiles')
  getAllProfiles() {
    return this.admin.getAllProfiles();
  }

  /**
   * Get route rates for profile
   */
  @Get('config/routes/:profileCode')
  getRouteRates(@Param('profileCode') profileCode: string) {
    return this.admin.getRouteRates(profileCode);
  }

  /**
   * Get grouped route rates (for UI tables)
   */
  @Get('config/routes/:profileCode/grouped')
  getRouteRatesGrouped(@Param('profileCode') profileCode: string) {
    return this.admin.getRouteRatesGrouped(profileCode);
  }

  /**
   * Upsert single route rate
   */
  @Post('config/routes')
  upsertRouteRate(@Body() dto: UpsertRouteRateDto) {
    return this.admin.upsertRouteRate(dto);
  }

  /**
   * Bulk upsert route rates
   */
  @Post('config/routes/bulk')
  bulkUpsertRouteRates(@Body() rates: UpsertRouteRateDto[]) {
    return this.admin.bulkUpsertRouteRates(rates);
  }

  /**
   * Delete route rate
   */
  @Delete('config/routes/:id')
  deleteRouteRate(@Param('id') id: string) {
    return this.admin.deleteRouteRate(id);
  }

  /**
   * Get auction fee rules
   */
  @Get('config/auction-fees/:profileCode')
  getAuctionFeeRules(@Param('profileCode') profileCode: string) {
    return this.admin.getAuctionFeeRules(profileCode);
  }

  /**
   * Upsert auction fee rule
   */
  @Post('config/auction-fees')
  upsertAuctionFeeRule(@Body() dto: UpsertAuctionFeeRuleDto) {
    return this.admin.upsertAuctionFeeRule(dto);
  }

  /**
   * Delete auction fee rule
   */
  @Delete('config/auction-fees/:id')
  deleteAuctionFeeRule(@Param('id') id: string) {
    return this.admin.deleteAuctionFeeRule(id);
  }

  /**
   * Get all quotes (admin)
   */
  @Get('admin/quotes')
  getAdminQuotes(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.getQuotes({ 
      status, 
      limit: limit ? parseInt(limit) : undefined 
    });
  }

  /**
   * Update quote status
   */
  @Patch('admin/quotes/:id/status')
  updateQuoteStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.admin.updateQuoteStatus(id, status);
  }

  /**
   * Get calculator stats
   */
  @Get('admin/stats')
  getStats() {
    return this.admin.getCalculatorStats();
  }

  // ============ MANAGER PRICE OVERRIDE ============

  /**
   * Manager price override with full audit
   */
  @Patch('quote/:id/override')
  managerPriceOverride(
    @Param('id') id: string,
    @Body() body: { 
      newPrice: number; 
      reason: string; 
      managerId: string;
      managerName?: string;
    },
  ) {
    return this.engine.managerPriceOverride(id, body);
  }

  /**
   * Get quote audit history
   */
  @Get('quote/:id/audit')
  getQuoteAuditHistory(@Param('id') id: string) {
    return this.engine.getQuoteAuditHistory(id);
  }

  /**
   * Get manager override analytics
   */
  @Get('admin/manager-analytics')
  getManagerOverrideAnalytics(
    @Query('managerId') managerId?: string,
    @Query('days') days?: string,
  ) {
    return this.engine.getManagerOverrideAnalytics(
      managerId, 
      days ? parseInt(days) : 30
    );
  }

  /**
   * Revert quote to scenario price
   */
  @Patch('quote/:id/revert')
  revertToScenarioPrice(
    @Param('id') id: string,
    @Body() body: { 
      scenario: 'minimum' | 'recommended' | 'aggressive';
      managerId: string;
    },
  ) {
    return this.engine.revertToScenarioPrice(id, body.scenario, body.managerId);
  }
}
