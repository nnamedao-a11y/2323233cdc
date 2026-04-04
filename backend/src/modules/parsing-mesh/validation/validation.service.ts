/**
 * Validation Service
 * 
 * Валідація та тестування джерел на sample VINs
 * Керує source lifecycle transitions
 */

import { Injectable, Logger } from '@nestjs/common';
import { SourceService } from '../sources/source.service';
import { AdapterRegistry } from '../adapters/adapter.registry';
import { SourceValidationResult, SourceConfig } from '../adapters/interfaces/vin-source-adapter.interface';
import { MeshSource } from '../sources/source.schema';

export interface ValidationReport {
  source: string;
  status: string;
  result: SourceValidationResult;
  recommendation: 'activate' | 'keep' | 'degrade' | 'disable' | 'quarantine';
  reason: string;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    private readonly sourceService: SourceService,
    private readonly adapterRegistry: AdapterRegistry,
  ) {}

  /**
   * Validate a single source
   */
  async validateSource(source: MeshSource): Promise<ValidationReport> {
    const adapter = this.adapterRegistry.get(source.parserKind);
    
    if (!adapter) {
      return {
        source: source.name,
        status: 'error',
        result: {
          valid: false,
          hitRate: 0,
          avgCompleteness: 0,
          avgLatency: 0,
          testedVins: 0,
          successfulVins: 0,
          errors: [`No adapter found for kind: ${source.parserKind}`],
        },
        recommendation: 'disable',
        reason: 'No adapter available',
      };
    }

    try {
      const sourceConfig = this.toSourceConfig(source);
      const result = adapter.validate
        ? await adapter.validate(sourceConfig)
        : await this.basicValidation(source, adapter);

      // Update source stats
      await this.sourceService.update(source.name, {
        vinHitRate: result.hitRate,
        dataCompleteness: result.avgCompleteness,
        avgLatency: result.avgLatency,
        lastTestedAt: new Date(),
      });

      const recommendation = this.getRecommendation(source, result);

      this.logger.log(
        `Validated ${source.name}: hitRate=${(result.hitRate * 100).toFixed(1)}%, ` +
        `completeness=${(result.avgCompleteness * 100).toFixed(1)}%, ` +
        `recommendation=${recommendation.action}`
      );

      return {
        source: source.name,
        status: result.valid ? 'valid' : 'invalid',
        result,
        recommendation: recommendation.action,
        reason: recommendation.reason,
      };
    } catch (error: any) {
      this.logger.error(`Validation error for ${source.name}: ${error.message}`);
      
      return {
        source: source.name,
        status: 'error',
        result: {
          valid: false,
          hitRate: 0,
          avgCompleteness: 0,
          avgLatency: 0,
          testedVins: source.sampleVins?.length || 0,
          successfulVins: 0,
          errors: [error.message],
        },
        recommendation: 'disable',
        reason: `Validation error: ${error.message}`,
      };
    }
  }

  /**
   * Validate all sources
   */
  async validateAll(): Promise<ValidationReport[]> {
    const sources = await this.sourceService.getAll();
    const reports: ValidationReport[] = [];

    for (const source of sources) {
      // Skip already quarantined
      if (source.quarantine) {
        this.logger.debug(`Skipping quarantined source: ${source.name}`);
        continue;
      }

      const report = await this.validateSource(source);
      reports.push(report);

      // Apply recommendation
      await this.applyRecommendation(source.name, report);

      // Rate limit between validations
      await this.delay(500);
    }

    const summary = {
      total: reports.length,
      valid: reports.filter(r => r.status === 'valid').length,
      invalid: reports.filter(r => r.status === 'invalid').length,
      errors: reports.filter(r => r.status === 'error').length,
    };

    this.logger.log(
      `Validation complete: ${summary.valid}/${summary.total} valid, ` +
      `${summary.invalid} invalid, ${summary.errors} errors`
    );

    return reports;
  }

  /**
   * Validate sources by status
   */
  async validateByStatus(status: string): Promise<ValidationReport[]> {
    const sources = await this.sourceService.getAll();
    const filtered = sources.filter(s => s.status === status);
    
    const reports: ValidationReport[] = [];
    
    for (const source of filtered) {
      const report = await this.validateSource(source);
      reports.push(report);
      await this.applyRecommendation(source.name, report);
      await this.delay(500);
    }
    
    return reports;
  }

  /**
   * Health check all active sources
   */
  async healthCheckAll(): Promise<{ healthy: number; unhealthy: number; results: any[] }> {
    const sources = await this.sourceService.getActiveSources();
    const results: any[] = [];
    let healthy = 0;
    let unhealthy = 0;

    for (const source of sources) {
      const adapter = this.adapterRegistry.get(source.parserKind);
      if (!adapter) continue;

      try {
        const health = await adapter.healthCheck(this.toSourceConfig(source));
        
        results.push({
          source: source.name,
          healthy: health.healthy,
          latency: health.latency,
          message: health.message,
        });

        if (health.healthy) {
          healthy++;
        } else {
          unhealthy++;
          // Record failure
          await this.sourceService.recordFailure(source.name);
        }

        await this.sourceService.update(source.name, {
          lastHealthCheckAt: new Date(),
        });
      } catch (error: any) {
        unhealthy++;
        results.push({
          source: source.name,
          healthy: false,
          latency: 0,
          message: error.message,
        });
      }
    }

    return { healthy, unhealthy, results };
  }

  // ========== PRIVATE ==========

  private async basicValidation(source: MeshSource, adapter: any): Promise<SourceValidationResult> {
    const vins = source.sampleVins || ['5YJSA1DN2CFP09123', '1G1JC524717100001'];
    const errors: string[] = [];
    let successfulVins = 0;
    let totalCompleteness = 0;
    let totalLatency = 0;

    for (const vin of vins) {
      try {
        const startTime = Date.now();
        const sourceConfig = this.toSourceConfig(source);
        const results = await adapter.search?.(vin, sourceConfig);
        totalLatency += Date.now() - startTime;

        if (results && results.length > 0) {
          const vehicle = await adapter.extract(results[0], sourceConfig);
          if (vehicle && vehicle.vin) {
            successfulVins++;
            totalCompleteness += vehicle.confidence;
          }
        }
      } catch (error: any) {
        errors.push(`VIN ${vin}: ${error.message}`);
      }
    }

    return {
      valid: successfulVins >= Math.ceil(vins.length * 0.3),
      hitRate: successfulVins / vins.length,
      avgCompleteness: successfulVins > 0 ? totalCompleteness / successfulVins : 0,
      avgLatency: totalLatency / vins.length,
      testedVins: vins.length,
      successfulVins,
      errors,
    };
  }

  private getRecommendation(
    source: MeshSource,
    result: SourceValidationResult,
  ): { action: 'activate' | 'keep' | 'degrade' | 'disable' | 'quarantine'; reason: string } {
    // Check for errors
    if (result.errors.length > result.testedVins * 0.5) {
      return { action: 'quarantine', reason: 'Too many errors during validation' };
    }

    // Check hit rate
    if (result.hitRate === 0) {
      if (source.status === 'active') {
        return { action: 'degrade', reason: 'Zero hit rate' };
      }
      return { action: 'disable', reason: 'No successful validations' };
    }

    if (result.hitRate < 0.3) {
      if (source.status === 'active') {
        return { action: 'degrade', reason: `Low hit rate: ${(result.hitRate * 100).toFixed(1)}%` };
      }
      return { action: 'keep', reason: 'Below threshold, monitoring' };
    }

    // Check completeness
    if (result.avgCompleteness < 0.3) {
      return { action: 'degrade', reason: `Low data completeness: ${(result.avgCompleteness * 100).toFixed(1)}%` };
    }

    // Good performance
    if (result.hitRate >= 0.6 && result.avgCompleteness >= 0.5) {
      if (source.status !== 'active') {
        return { action: 'activate', reason: 'Good performance metrics' };
      }
      return { action: 'keep', reason: 'Healthy' };
    }

    // Moderate performance
    if (result.hitRate >= 0.4) {
      if (source.status === 'degraded') {
        return { action: 'activate', reason: 'Recovered from degraded state' };
      }
      return { action: 'keep', reason: 'Acceptable performance' };
    }

    return { action: 'keep', reason: 'Monitoring' };
  }

  private async applyRecommendation(name: string, report: ValidationReport): Promise<void> {
    switch (report.recommendation) {
      case 'activate':
        await this.sourceService.activate(name);
        break;
      case 'degrade':
        await this.sourceService.degrade(name, report.reason);
        break;
      case 'disable':
        await this.sourceService.disable(name, report.reason);
        break;
      case 'quarantine':
        await this.sourceService.quarantineSource(name, report.reason);
        break;
      // 'keep' - no action
    }
  }

  private toSourceConfig(source: MeshSource): SourceConfig {
    return {
      id: (source as any)._id?.toString() || source.name,
      name: source.name,
      domain: source.domain,
      parserKind: source.parserKind as any,
      type: source.type as any,
      enabled: source.enabled,
      priority: source.priority,
      trustScore: source.trustScore,
      vinHitRate: source.vinHitRate,
      dataCompleteness: source.dataCompleteness,
      freshnessScore: source.freshnessScore,
      avgLatency: source.avgLatency,
      requestConfig: source.requestConfig || {},
      selectorConfig: source.selectorConfig || {},
      sampleVins: source.sampleVins || [],
      lastSuccessAt: source.lastSuccessAt,
      lastFailureAt: source.lastFailureAt,
      cooldownUntil: source.cooldownUntil,
      quarantine: source.quarantine,
      quarantineReason: source.quarantineReason,
      status: source.status as any,
      consecutiveFailures: source.consecutiveFailures,
      consecutiveSuccesses: source.consecutiveSuccesses,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
