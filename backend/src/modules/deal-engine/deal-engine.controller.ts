/**
 * Deal Engine Controller
 * 
 * Endpoints:
 * - POST /api/deal-engine/evaluate - Full deal evaluation
 * - POST /api/deal-engine/quick - Quick decision only
 * - POST /api/deal-engine/batch - Batch evaluate multiple deals
 */

import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { DealEngineService, DealEngineInput } from './deal-engine.service';

@Controller('deal-engine')
export class DealEngineController {
  constructor(private readonly dealEngineService: DealEngineService) {}

  /**
   * Full deal evaluation
   */
  @Post('evaluate')
  async evaluate(@Body() dto: any) {
    this.validateInput(dto);
    return this.dealEngineService.evaluate(dto as DealEngineInput);
  }

  /**
   * Quick evaluation - just decision and score
   */
  @Post('quick')
  async quickEvaluate(@Body() dto: any) {
    this.validateInput(dto);
    return this.dealEngineService.quickEvaluate(dto as DealEngineInput);
  }

  /**
   * Batch evaluate multiple deals
   */
  @Post('batch')
  async batchEvaluate(@Body() dtos: any[]) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      throw new HttpException('Array of deals required', HttpStatus.BAD_REQUEST);
    }

    if (dtos.length > 50) {
      throw new HttpException('Maximum 50 deals per batch', HttpStatus.BAD_REQUEST);
    }

    const results = await Promise.all(
      dtos.map(async (dto, index) => {
        try {
          this.validateInput(dto);
          const result = await this.dealEngineService.evaluate(dto);
          return { index, vin: dto.vin, success: true, result };
        } catch (error) {
          return { index, vin: dto.vin, success: false, error: error.message };
        }
      })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      summary: {
        total: dtos.length,
        successful,
        failed,
      },
      results,
    };
  }

  private validateInput(dto: any) {
    if (dto.marketPrice === undefined || dto.marketPrice <= 0) {
      throw new HttpException('marketPrice must be positive', HttpStatus.BAD_REQUEST);
    }
    if (dto.maxBid === undefined || dto.maxBid <= 0) {
      throw new HttpException('maxBid must be positive', HttpStatus.BAD_REQUEST);
    }
    if (dto.finalAllInPrice === undefined || dto.finalAllInPrice <= 0) {
      throw new HttpException('finalAllInPrice must be positive', HttpStatus.BAD_REQUEST);
    }
    if (dto.confidence === undefined || dto.confidence < 0 || dto.confidence > 1) {
      throw new HttpException('confidence must be between 0 and 1', HttpStatus.BAD_REQUEST);
    }
    if (dto.sourceCount === undefined || dto.sourceCount < 0) {
      throw new HttpException('sourceCount must be >= 0', HttpStatus.BAD_REQUEST);
    }
  }
}
