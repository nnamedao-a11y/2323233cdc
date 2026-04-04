/**
 * VIN Unified Controller
 * 
 * ЄДИНИЙ API для VIN
 * 
 * GET /api/vin-unified/resolve?vin=XXX - Main endpoint
 * GET /api/vin-unified/:vin - Search by param
 * POST /api/vin-unified/lead - Create lead from VIN
 * GET /api/vin-unified/dashboard/sources - Source metrics
 * GET /api/vin-unified/dashboard/status - System status
 */

import { Controller, Get, Post, Body, Param, Query, Logger, BadRequestException } from '@nestjs/common';
import { VinUnifiedService } from './vin-unified.service';
import { VinResolveResponseDto, CreateVinLeadDto } from './dto/vin.dto';
import { SourceHealthTracker } from './anti-block/source-health-tracker';
import { DynamicWeightEngine } from './anti-block/dynamic-weight.engine';
import { FallbackStrategyService } from './fallback/fallback-strategy.service';

@Controller('vin-unified')
export class VinUnifiedController {
  private readonly logger = new Logger(VinUnifiedController.name);

  constructor(
    private readonly vinService: VinUnifiedService,
    private readonly healthTracker: SourceHealthTracker,
    private readonly weightEngine: DynamicWeightEngine,
    private readonly fallbackStrategyService: FallbackStrategyService,
  ) {}

  /**
   * Main VIN resolve endpoint
   * GET /api/vin-unified/resolve?vin=XXX&skipCache=true
   */
  @Get('resolve')
  async resolve(
    @Query('vin') vin: string,
    @Query('skipCache') skipCache?: string,
  ): Promise<VinResolveResponseDto> {
    this.logger.log(`[VIN] Resolve request: ${vin} (skipCache=${skipCache})`);
    
    if (!vin) {
      throw new BadRequestException('VIN є обов\'язковим');
    }
    
    // Clean and validate VIN
    const cleanVin = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (cleanVin.length !== 17) {
      throw new BadRequestException('VIN має містити рівно 17 символів');
    }

    return this.vinService.resolve(cleanVin, {
      skipCache: skipCache === 'true',
    });
  }

  /**
   * Quick resolve (Tier 1 only - fast)
   * GET /api/vin-unified/quick?vin=XXX
   */
  @Get('quick')
  async quickResolve(@Query('vin') vin: string): Promise<VinResolveResponseDto> {
    this.logger.log(`[VIN] Quick resolve: ${vin}`);
    
    if (!vin) {
      throw new BadRequestException('VIN є обов\'язковим');
    }
    
    const cleanVin = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (cleanVin.length !== 17) {
      throw new BadRequestException('VIN має містити рівно 17 символів');
    }

    return this.vinService.resolve(cleanVin, { quick: true });
  }

  /**
   * Create lead from VIN search
   * POST /api/vin-unified/lead
   */
  @Post('lead')
  async createLead(@Body() dto: CreateVinLeadDto): Promise<{ success: boolean; leadId?: string; message: string }> {
    this.logger.log(`[VIN] Create lead for: ${dto.vin}`);
    return this.vinService.createLead(dto);
  }

  /**
   * Ultra-Fast VIN resolve (5-10 sec target)
   * GET /api/vin-unified/ultra-fast?vin=XXX
   * 
   * Uses aggressive timeouts:
   * - Global timeout: 10s
   * - Only Core sources (Copart + IAAI)
   * - Early return enabled
   * - No fallback layer
   */
  @Get('ultra-fast')
  async ultraFastResolve(@Query('vin') vin: string): Promise<VinResolveResponseDto> {
    this.logger.log(`[VIN] Ultra-fast resolve: ${vin}`);
    
    if (!vin) {
      throw new BadRequestException('VIN є обов\'язковим');
    }
    
    const cleanVin = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (cleanVin.length !== 17) {
      throw new BadRequestException('VIN має містити рівно 17 символів');
    }

    return this.vinService.resolve(cleanVin, {
      timeout: 10000, // 10s global timeout
      useOrchestrator: true,
    });
  }

  /**
   * Search by VIN param
   * GET /api/vin-unified/:vin
   */
  @Get(':vin')
  async searchByParam(@Param('vin') vin: string): Promise<VinResolveResponseDto> {
    // Avoid conflict with 'resolve', 'quick', 'lead', 'dashboard'
    if (['resolve', 'quick', 'lead', 'dashboard'].includes(vin.toLowerCase())) {
      throw new BadRequestException('Invalid VIN');
    }
    
    this.logger.log(`[VIN] Search by param: ${vin}`);
    
    const cleanVin = vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (cleanVin.length !== 17) {
      throw new BadRequestException('VIN має містити рівно 17 символів');
    }

    return this.vinService.resolve(cleanVin);
  }

  /**
   * Dashboard: Source metrics
   * GET /api/vin-unified/dashboard/sources
   */
  @Get('dashboard/sources')
  async getDashboardSources(): Promise<any[]> {
    const allHealth = this.healthTracker.getAll();
    const allWeights = this.weightEngine.getAllEffectiveWeights();

    const knownSources = [
      'LocalDecoder', 'Copart', 'IAAI', 'AutoBidMaster', 
      'SalvageReseller', 'BidFax', 'Poctra', 'StatVin'
    ];

    const result: any[] = [];

    for (const sourceName of knownSources) {
      const health = allHealth.find(h => h.source === sourceName);
      const weights = allWeights[sourceName] || { base: 0.5, effective: 0.5, multiplier: 1 };

      result.push({
        source: sourceName,
        health: health ? {
          successRate: health.totalRequests > 0
            ? ((health.successCount / health.totalRequests) * 100).toFixed(1) + '%'
            : 'N/A',
          vinMatchRate: health.successCount > 0
            ? ((health.vinMatchedCount / health.successCount) * 100).toFixed(1) + '%'
            : 'N/A',
          blockRate: health.totalRequests > 0
            ? ((health.blockedCount / health.totalRequests) * 100).toFixed(1) + '%'
            : 'N/A',
        } : { successRate: 'N/A', vinMatchRate: 'N/A', blockRate: 'N/A' },
        performance: health ? {
          avgLatencyMs: Math.round(health.avgDurationMs),
          avgScore: Number(health.avgScore.toFixed(2)),
          totalRequests: health.totalRequests,
        } : { avgLatencyMs: 0, avgScore: 0, totalRequests: 0 },
        weights: {
          base: weights.base,
          effective: weights.effective,
          multiplier: weights.multiplier,
        },
        flags: health ? {
          degraded: health.degraded,
          lastError: health.lastError || null,
        } : { degraded: false, lastError: null },
      });
    }

    return result.sort((a, b) => (b.weights?.effective || 0) - (a.weights?.effective || 0));
  }

  /**
   * Dashboard: System status
   * GET /api/vin-unified/dashboard/status
   */
  @Get('dashboard/status')
  async getDashboardStatus() {
    const allHealth = this.healthTracker.getAll();
    const allWeights = this.weightEngine.getAllEffectiveWeights();
    const currentStrategy = this.fallbackStrategyService.getStrategy();

    const totalRequests = allHealth.reduce((sum, h) => sum + h.totalRequests, 0);
    const totalSuccess = allHealth.reduce((sum, h) => sum + h.successCount, 0);
    const totalBlocked = allHealth.reduce((sum, h) => sum + h.blockedCount, 0);

    const degradedSources = allHealth.filter(h => h.degraded).map(h => h.source);
    const healthySources = allHealth.filter(h => !h.degraded && h.successCount > 0).map(h => h.source);

    return {
      overview: {
        totalRequests,
        overallSuccessRate: totalRequests > 0 
          ? ((totalSuccess / totalRequests) * 100).toFixed(1) + '%'
          : 'N/A',
        overallBlockRate: totalRequests > 0
          ? ((totalBlocked / totalRequests) * 100).toFixed(1) + '%'
          : 'N/A',
      },
      sources: {
        healthy: healthySources,
        degraded: degradedSources,
        total: Object.keys(allWeights).length,
      },
      topSources: Object.entries(allWeights)
        .sort((a, b) => b[1].effective - a[1].effective)
        .slice(0, 3)
        .map(([name, w]) => ({ name, effectiveWeight: w.effective })),
      fallbackStrategy: {
        mode: currentStrategy.mode,
        delayMs: currentStrategy.delayMs,
      },
    };
  }
}
