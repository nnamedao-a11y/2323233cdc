/**
 * VIN Price Controller
 * 
 * API endpoints:
 * - GET /vin-price/:vin - Full VIN price analysis
 * - POST /vin-price/quick - Quick estimate without VIN
 * - POST /vin-price/calculate - Calculate with custom bid
 */

import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { VinPriceService, VinPriceResult } from './vin-price.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class QuickEstimateDto {
  make: string;
  model: string;
  year: number;
  damage?: string;
  mileage?: number;
}

class CalculateDto {
  vin: string;
  currentBid?: number;
}

@Controller('vin-price')
export class VinPriceController {
  constructor(private readonly vinPriceService: VinPriceService) {}

  /**
   * GET /api/vin-price/:vin
   * Full VIN price analysis
   */
  @Get(':vin')
  async getVinPrice(
    @Param('vin') vin: string,
    @Query('bid') currentBid?: string,
  ): Promise<VinPriceResult> {
    const bid = currentBid ? parseFloat(currentBid) : undefined;
    return this.vinPriceService.calculate(vin, bid);
  }

  /**
   * POST /api/vin-price/quick
   * Quick estimate without VIN parsing
   */
  @Post('quick')
  async quickEstimate(@Body() dto: QuickEstimateDto): Promise<Partial<VinPriceResult>> {
    return this.vinPriceService.quickEstimate(
      dto.make,
      dto.model,
      dto.year,
      dto.damage,
      dto.mileage,
    );
  }

  /**
   * POST /api/vin-price/calculate
   * Calculate with custom parameters
   */
  @Post('calculate')
  async calculate(@Body() dto: CalculateDto): Promise<VinPriceResult> {
    return this.vinPriceService.calculate(dto.vin, dto.currentBid);
  }

  /**
   * GET /api/vin-price/:vin/bid/:amount
   * Check deal status for specific bid
   */
  @Get(':vin/bid/:amount')
  async checkBid(
    @Param('vin') vin: string,
    @Param('amount') amount: string,
  ): Promise<VinPriceResult> {
    return this.vinPriceService.calculate(vin, parseFloat(amount));
  }
}
