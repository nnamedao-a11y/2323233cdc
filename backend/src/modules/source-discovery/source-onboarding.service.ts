/**
 * Source Onboarding Service
 * 
 * Автоматичне додавання перевірених джерел в Source Registry
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiscoveredSource, DiscoveredSourceDocument } from './discovered-source.schema';
import { SourceRegistryService } from '../source-registry/source-registry.service';

@Injectable()
export class SourceOnboardingService {
  private readonly logger = new Logger(SourceOnboardingService.name);

  constructor(
    @InjectModel(DiscoveredSource.name)
    private readonly discoveredModel: Model<DiscoveredSourceDocument>,
    private readonly registry: SourceRegistryService,
  ) {}

  /**
   * Promote qualified sources to the main registry
   */
  async promoteSources(
    minReliability: number = 0.6,
    minCheckCount: number = 3,
  ): Promise<{ promoted: number; failed: number }> {
    let promoted = 0;
    let failed = 0;

    const candidates = await this.discoveredModel.find({
      vinSupport: true,
      reliabilityScore: { $gte: minReliability },
      checkCount: { $gte: minCheckCount },
      addedToRegistry: false,
    }).lean();

    this.logger.log(`Found ${candidates.length} candidates for promotion`);

    for (const source of candidates) {
      try {
        // Create display name from domain
        const displayName = this.formatDisplayName(source.domain);

        // Determine source type based on domain patterns
        const type = this.determineSourceType(source.domain);

        // Calculate initial weight based on reliability
        const initialWeight = Math.min(0.7, source.reliabilityScore);

        // Add to registry
        await this.registry.createIfMissing(source.domain, displayName);
        
        // Update with proper values
        await this.registry.updateManualWeight(source.domain, initialWeight);

        // Mark as promoted
        await this.discoveredModel.updateOne(
          { domain: source.domain },
          {
            addedToRegistry: true,
            addedToRegistryAt: new Date(),
          },
        );

        promoted++;
        this.logger.log(
          `Promoted ${source.domain} to registry (reliability: ${source.reliabilityScore.toFixed(2)}, ` +
          `type: ${type})`
        );
      } catch (error: any) {
        failed++;
        this.logger.error(`Failed to promote ${source.domain}: ${error.message}`);
      }
    }

    this.logger.log(`Promotion complete: ${promoted} promoted, ${failed} failed`);
    return { promoted, failed };
  }

  /**
   * Force promote a specific source
   */
  async forcePromote(domain: string): Promise<boolean> {
    const source = await this.discoveredModel.findOne({ domain });
    
    if (!source) {
      this.logger.warn(`Source not found: ${domain}`);
      return false;
    }

    try {
      const displayName = this.formatDisplayName(domain);
      await this.registry.createIfMissing(domain, displayName);
      
      await this.discoveredModel.updateOne(
        { domain },
        {
          addedToRegistry: true,
          addedToRegistryAt: new Date(),
        },
      );

      this.logger.log(`Force promoted ${domain} to registry`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to force promote ${domain}: ${error.message}`);
      return false;
    }
  }

  /**
   * Format domain into display name
   */
  private formatDisplayName(domain: string): string {
    // Remove common TLDs and format
    const name = domain
      .replace(/\.(com|net|org|info|io|co)$/i, '')
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    return name;
  }

  /**
   * Determine source type based on domain
   */
  private determineSourceType(domain: string): string {
    const aggregatorPatterns = ['bidfax', 'poctra', 'stat.vin', 'vincheck', 'carfax'];
    const competitorPatterns = ['autobidmaster', 'salvagebid', 'copart', 'iaai'];
    const databasePatterns = ['nhtsa', 'dmv', 'gov'];

    const lowerDomain = domain.toLowerCase();

    if (aggregatorPatterns.some(p => lowerDomain.includes(p))) return 'aggregator';
    if (competitorPatterns.some(p => lowerDomain.includes(p))) return 'competitor';
    if (databasePatterns.some(p => lowerDomain.includes(p))) return 'database';
    
    return 'web_search';
  }
}
