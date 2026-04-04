/**
 * VIN Resolver Controller
 * 
 * GET /api/vin-resolver/:vin - Main resolve endpoint
 * GET /api/vin-resolver/:vin/test - Test endpoint for admin
 */

import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { VinResolverService, VinResolverResult } from './vin-resolver.service';

@Controller('vin-resolver')
export class VinResolverController {
  private readonly logger = new Logger(VinResolverController.name);

  constructor(private readonly vinResolver: VinResolverService) {}

  /**
   * Main VIN Resolve endpoint
   * 
   * GET /api/vin-resolver/:vin
   * 
   * Query params:
   * - forceRefresh: boolean - skip cache and re-search
   * - includeEstimates: boolean - include price estimates
   * - destination: string - destination country for pricing (default: UA)
   */
  @Get(':vin')
  async resolve(
    @Param('vin') vin: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('includeEstimates') includeEstimates?: string,
    @Query('destination') destination?: string,
  ): Promise<VinResolverResult> {
    this.logger.log(`[VinResolver API] Request for VIN: ${vin}`);
    
    return this.vinResolver.resolve(vin, {
      forceRefresh: forceRefresh === 'true',
      includeEstimates: includeEstimates !== 'false',
      destinationCountry: destination || 'UA',
    });
  }

  /**
   * Test endpoint - returns detailed breakdown for admin testing
   * 
   * GET /api/vin-resolver/:vin/test
   */
  @Get(':vin/test')
  async test(
    @Param('vin') vin: string,
  ): Promise<{
    result: VinResolverResult;
    debug: {
      vinNormalized: string | null;
      searchStarted: Date;
      searchEnded: Date;
    };
  }> {
    this.logger.log(`[VinResolver API] Test request for VIN: ${vin}`);
    
    const searchStarted = new Date();
    const result = await this.vinResolver.resolve(vin, {
      forceRefresh: true,
      includeEstimates: true,
    });
    const searchEnded = new Date();

    return {
      result,
      debug: {
        vinNormalized: vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''),
        searchStarted,
        searchEnded,
      },
    };
  }
}
