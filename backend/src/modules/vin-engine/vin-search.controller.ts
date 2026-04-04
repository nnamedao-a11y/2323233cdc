/**
 * VIN Search Controller
 * 
 * Public API for VIN search
 */

import { Controller, Get, Post, Query, Param, Delete, UseGuards, Logger } from '@nestjs/common';
import { VinSearchService, VinSearchResult } from './vin-search.service';
import { VinCacheService } from './vin-cache.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('vin')
export class VinSearchController {
  private readonly logger = new Logger(VinSearchController.name);

  constructor(
    private vinSearchService: VinSearchService,
    private vinCacheService: VinCacheService,
  ) {}

  /**
   * Public VIN search endpoint
   * GET /api/vin/search?vin=XXXXXXXXXXXXX
   */
  @Get('search')
  async search(@Query('vin') vin: string): Promise<VinSearchResult> {
    this.logger.log(`VIN search request: ${vin}`);
    return this.vinSearchService.search(vin);
  }

  /**
   * Search VIN by param
   * GET /api/vin/:vin
   */
  @Get(':vin')
  async searchByParam(@Param('vin') vin: string): Promise<VinSearchResult> {
    this.logger.log(`VIN search request (param): ${vin}`);
    return this.vinSearchService.search(vin);
  }

  /**
   * Get cache stats (admin only)
   * GET /api/vin/admin/cache-stats
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Get('admin/cache-stats')
  async getCacheStats() {
    return this.vinCacheService.getStats();
  }

  /**
   * Clear cache (admin only)
   * DELETE /api/vin/admin/cache
   * DELETE /api/vin/admin/cache/:vin
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Delete('admin/cache/:vin?')
  async clearCache(@Param('vin') vin?: string) {
    return this.vinSearchService.clearCache(vin);
  }

  /**
   * Force refresh VIN data
   * POST /api/vin/:vin/refresh
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Post(':vin/refresh')
  async refreshVin(@Param('vin') vin: string): Promise<VinSearchResult> {
    // Clear cache first
    await this.vinSearchService.clearCache(vin);
    // Then search again
    return this.vinSearchService.search(vin);
  }
}
