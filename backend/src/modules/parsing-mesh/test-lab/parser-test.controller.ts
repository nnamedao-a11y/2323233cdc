/**
 * Parser Test Controller
 * 
 * Test Lab для тестування VIN пошуку та джерел
 */

import { Controller, Get, Post, Query, Param, Body, UseGuards } from '@nestjs/common';
import { VinOrchestratorService } from '../orchestrator/vin-orchestrator.service';
import { SourceService } from '../sources/source.service';
import { AdapterRegistry } from '../adapters/adapter.registry';
import { ValidationService } from '../validation/validation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../shared/enums';

@Controller('admin/parser-mesh')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParserTestController {
  constructor(
    private readonly orchestrator: VinOrchestratorService,
    private readonly sourceService: SourceService,
    private readonly adapterRegistry: AdapterRegistry,
    private readonly validationService: ValidationService,
  ) {}

  // ========== TEST LAB ==========

  /**
   * Test VIN search across all sources
   * GET /api/admin/parser-mesh/test-vin?vin=XXX
   */
  @Get('test-vin')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async testVin(
    @Query('vin') vin: string,
    @Query('maxSources') maxSources?: string,
  ) {
    const result = await this.orchestrator.search(vin, {
      maxSources: maxSources ? parseInt(maxSources, 10) : undefined,
    });

    return {
      vin: result.vin,
      success: result.success,
      sourcesUsed: result.sourcesUsed,
      sourcesSuccessful: result.sourcesSuccessful,
      candidatesCount: result.candidates.length,
      durationMs: result.searchDurationMs,
      merged: result.merged ? {
        vin: result.merged.vin,
        title: result.merged.title,
        make: result.merged.make,
        model: result.merged.model,
        year: result.merged.year,
        price: result.merged.price,
        saleDate: result.merged.saleDate,
        lotNumber: result.merged.lotNumber,
        damage: result.merged.damage,
        imagesCount: result.merged.allImages?.length || 0,
        confidence: result.merged.confidence,
        sourcesCount: result.merged.sourcesCount,
        allSources: result.merged.allSources,
      } : null,
      sourceBreakdown: result.sourceBreakdown,
    };
  }

  /**
   * Test specific source
   * GET /api/admin/parser-mesh/test-source/:sourceName?vin=XXX
   */
  @Get('test-source/:sourceName')
  @Roles(UserRole.OWNER)
  async testSource(
    @Param('sourceName') sourceName: string,
    @Query('vin') vin: string,
  ) {
    const result = await this.orchestrator.searchSingleSource(vin, sourceName);

    return {
      source: sourceName,
      vin,
      success: result.success,
      candidatesCount: result.candidates.length,
      latencyMs: result.latencyMs,
      message: result.message,
      candidates: result.candidates.map(c => ({
        vin: c.vin,
        title: c.title,
        price: c.price,
        imagesCount: c.images?.length || 0,
        confidence: c.confidence,
        sourceUrl: c.sourceUrl,
      })),
    };
  }

  /**
   * Test all adapters
   * GET /api/admin/parser-mesh/test-adapters?vin=XXX
   */
  @Get('test-adapters')
  @Roles(UserRole.OWNER)
  async testAdapters(@Query('vin') vin: string) {
    return this.orchestrator.testAllAdapters(vin);
  }

  // ========== SOURCES MANAGEMENT ==========

  /**
   * Get all mesh sources
   * GET /api/admin/parser-mesh/sources
   */
  @Get('sources')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getSources() {
    const sources = await this.sourceService.getAll();
    const stats = await this.sourceService.getStats();

    return {
      sources: sources.map(s => ({
        name: s.name,
        domain: s.domain,
        displayName: s.displayName,
        parserKind: s.parserKind,
        type: s.type,
        status: s.status,
        enabled: s.enabled,
        priority: s.priority,
        trustScore: s.trustScore,
        vinHitRate: s.vinHitRate,
        dataCompleteness: s.dataCompleteness,
        avgLatency: s.avgLatency,
        totalSearches: s.totalSearches,
        quarantine: s.quarantine,
        quarantineReason: s.quarantineReason,
        lastSuccessAt: s.lastSuccessAt,
        lastTestedAt: s.lastTestedAt,
      })),
      stats,
    };
  }

  /**
   * Get source details
   * GET /api/admin/parser-mesh/sources/:name
   */
  @Get('sources/:name')
  @Roles(UserRole.OWNER)
  async getSourceDetails(@Param('name') name: string) {
    const source = await this.sourceService.getByName(name);
    if (!source) {
      return { error: 'Source not found' };
    }
    return source;
  }

  /**
   * Update source
   * POST /api/admin/parser-mesh/sources/:name
   */
  @Post('sources/:name')
  @Roles(UserRole.OWNER)
  async updateSource(
    @Param('name') name: string,
    @Body() data: any,
  ) {
    const updated = await this.sourceService.update(name, data);
    return { success: !!updated, source: updated };
  }

  /**
   * Activate source
   * POST /api/admin/parser-mesh/sources/:name/activate
   */
  @Post('sources/:name/activate')
  @Roles(UserRole.OWNER)
  async activateSource(@Param('name') name: string) {
    await this.sourceService.activate(name);
    return { success: true, message: `Source ${name} activated` };
  }

  /**
   * Disable source
   * POST /api/admin/parser-mesh/sources/:name/disable
   */
  @Post('sources/:name/disable')
  @Roles(UserRole.OWNER)
  async disableSource(
    @Param('name') name: string,
    @Body() body: { reason?: string },
  ) {
    await this.sourceService.disable(name, body.reason);
    return { success: true, message: `Source ${name} disabled` };
  }

  /**
   * Quarantine source
   * POST /api/admin/parser-mesh/sources/:name/quarantine
   */
  @Post('sources/:name/quarantine')
  @Roles(UserRole.OWNER)
  async quarantineSource(
    @Param('name') name: string,
    @Body() body: { reason: string },
  ) {
    await this.sourceService.quarantineSource(name, body.reason);
    return { success: true, message: `Source ${name} quarantined` };
  }

  // ========== VALIDATION ==========

  /**
   * Validate a source
   * POST /api/admin/parser-mesh/validate/:name
   */
  @Post('validate/:name')
  @Roles(UserRole.OWNER)
  async validateSource(@Param('name') name: string) {
    const source = await this.sourceService.getByName(name);
    if (!source) {
      return { error: 'Source not found' };
    }
    return this.validationService.validateSource(source);
  }

  /**
   * Validate all sources
   * POST /api/admin/parser-mesh/validate-all
   */
  @Post('validate-all')
  @Roles(UserRole.OWNER)
  async validateAll() {
    return this.validationService.validateAll();
  }

  /**
   * Health check all active sources
   * GET /api/admin/parser-mesh/health
   */
  @Get('health')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async healthCheck() {
    return this.validationService.healthCheckAll();
  }

  // ========== ADAPTERS INFO ==========

  /**
   * Get available adapters
   * GET /api/admin/parser-mesh/adapters
   */
  @Get('adapters')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getAdapters() {
    const adapters = this.adapterRegistry.getAll();
    return {
      adapters: adapters.map(a => ({
        kind: a.kind,
        displayName: a.displayName,
      })),
      count: adapters.length,
    };
  }
}
