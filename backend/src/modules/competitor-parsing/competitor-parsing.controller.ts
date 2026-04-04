/**
 * Competitor Parsing Controller
 * 
 * Admin API для тестування та моніторингу competitor parsing
 */

import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { CompetitorRunnerService } from './competitor-runner.service';
import { getEnabledSources, COMPETITOR_SOURCES } from './competitor.config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('admin/competitors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompetitorParsingController {
  constructor(private readonly runner: CompetitorRunnerService) {}

  /**
   * GET /api/admin/competitors - список всіх джерел конкурентів
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getSources() {
    const all = COMPETITOR_SOURCES;
    const enabled = getEnabledSources();
    
    return {
      total: all.length,
      enabled: enabled.length,
      sources: all.map(s => ({
        name: s.name,
        displayName: s.displayName,
        baseUrl: s.baseUrl,
        priority: s.priority,
        rateLimit: s.rateLimit,
        enabled: s.enabled,
      })),
    };
  }

  /**
   * POST /api/admin/competitors/test/:vin - тест parsing для VIN
   */
  @Post('test/:vin')
  @Roles(UserRole.OWNER)
  async testVin(@Param('vin') vin: string) {
    const result = await this.runner.run(vin);
    
    return {
      vin: result.vin,
      stats: result.stats,
      results: result.results.map(r => ({
        sourceName: r.sourceName,
        sourceUrl: r.sourceUrl,
        vin: r.vin,
        title: r.title,
        price: r.price,
        imagesCount: r.images.length,
        saleDate: r.saleDate,
        lotNumber: r.lotNumber,
        confidence: r.confidence,
      })),
    };
  }

  /**
   * POST /api/admin/competitors/test/:vin/:source - тест конкретного джерела
   */
  @Post('test/:vin/:source')
  @Roles(UserRole.OWNER)
  async testSingleSource(
    @Param('vin') vin: string,
    @Param('source') source: string,
  ) {
    const result = await this.runner.runSingle(source, vin);
    
    if (!result) {
      return {
        success: false,
        message: `No data found from ${source} for VIN ${vin}`,
      };
    }

    return {
      success: true,
      data: {
        ...result,
        images: result.images.slice(0, 5), // Limit images in response
      },
    };
  }
}
