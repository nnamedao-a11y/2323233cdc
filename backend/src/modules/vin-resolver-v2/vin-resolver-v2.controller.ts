/**
 * VIN Resolver V2 Controller
 * 
 * ОДИН ENDPOINT - ОДИН TRUTH
 * GET /api/vin-resolve/:vin
 */

import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { VinResolverV2Service } from './vin-resolver-v2.service';
import { VinResolverResponseDto } from './dto/vin-resolver-response.dto';
import { SourceHealthService, SourceHealthSummary } from './services/source-health.service';
import { PuppeteerHtmlAdapter } from './services/puppeteer-html.adapter';

@Controller('vin-resolve')
export class VinResolverV2Controller {
  private readonly logger = new Logger(VinResolverV2Controller.name);

  constructor(
    private readonly resolver: VinResolverV2Service,
    private readonly sourceHealth: SourceHealthService,
    private readonly puppeteerAdapter: PuppeteerHtmlAdapter,
  ) {}

  /**
   * Main resolver endpoint
   * 
   * GET /api/vin-resolve/:vin
   * GET /api/vin-resolve/:vin?mode=quick
   * GET /api/vin-resolve/:vin?mode=full
   */
  @Get(':vin')
  async resolve(
    @Param('vin') vin: string,
    @Query('mode') mode?: 'quick' | 'standard' | 'full',
  ): Promise<VinResolverResponseDto> {
    this.logger.log(`[Controller] Resolve request: ${vin}, mode: ${mode || 'standard'}`);

    switch (mode) {
      case 'quick':
        return this.resolver.resolveQuick(vin);
      case 'full':
        return this.resolver.resolveFull(vin);
      default:
        return this.resolver.resolve(vin);
    }
  }

  /**
   * Quick resolve (tier 1 only) - faster
   */
  @Get(':vin/quick')
  async resolveQuick(@Param('vin') vin: string): Promise<VinResolverResponseDto> {
    return this.resolver.resolveQuick(vin);
  }

  /**
   * Full resolve (all tiers) - slower but more complete
   */
  @Get(':vin/full')
  async resolveFull(@Param('vin') vin: string): Promise<VinResolverResponseDto> {
    return this.resolver.resolveFull(vin);
  }
}

/**
 * Source Health Dashboard Controller
 */
@Controller('source-health')
export class SourceHealthController {
  constructor(
    private readonly sourceHealth: SourceHealthService,
    private readonly puppeteerAdapter: PuppeteerHtmlAdapter,
  ) {}

  /**
   * Get health dashboard summary
   */
  @Get()
  async getDashboard(): Promise<SourceHealthSummary> {
    return this.sourceHealth.getSummary();
  }

  /**
   * Get specific source health
   */
  @Get(':source')
  async getSourceHealth(@Param('source') source: string) {
    const health = this.sourceHealth.getSourceHealth(source);
    if (!health) {
      return { error: 'Source not found' };
    }
    return health;
  }

  /**
   * Get Puppeteer adapter health
   */
  @Get('adapter/puppeteer')
  async getPuppeteerHealth() {
    return this.puppeteerAdapter.healthCheck();
  }

  /**
   * Get sources ordered by score
   */
  @Get('ranking/all')
  async getSourceRanking() {
    const sources = this.sourceHealth.getSourcesByScore();
    return { sources, count: sources.length };
  }
}
