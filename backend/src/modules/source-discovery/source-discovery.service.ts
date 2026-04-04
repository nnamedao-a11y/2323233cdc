/**
 * Source Discovery Service
 * 
 * Автоматичний пошук та аналіз нових джерел VIN даних
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiscoveredSource, DiscoveredSourceDocument } from './discovered-source.schema';

@Injectable()
export class SourceDiscoveryService {
  private readonly logger = new Logger(SourceDiscoveryService.name);

  constructor(
    @InjectModel(DiscoveredSource.name)
    private readonly model: Model<DiscoveredSourceDocument>,
  ) {}

  /**
   * Discover new sources from search results
   */
  async discoverFromSearchResults(
    urls: string[],
    discoveredVia: string = 'web_search',
    discoveredVin?: string,
  ): Promise<{ discovered: number; existing: number }> {
    let discovered = 0;
    let existing = 0;

    for (const url of urls) {
      try {
        const domain = this.extractDomain(url);
        if (!domain || this.isExcludedDomain(domain)) continue;

        const existingSource = await this.model.findOne({ domain });
        
        if (existingSource) {
          existing++;
          continue;
        }

        await this.model.create({
          url,
          domain,
          vinSupport: false,
          discoveredVia,
          discoveredVin,
        });

        discovered++;
        this.logger.log(`Discovered new source: ${domain}`);
      } catch (error: any) {
        // Ignore duplicate key errors
        if (error.code !== 11000) {
          this.logger.warn(`Error discovering source from ${url}: ${error.message}`);
        }
      }
    }

    return { discovered, existing };
  }

  /**
   * Analyze a discovered source for VIN support
   */
  async analyzeSource(
    domain: string,
    vin: string,
    analysisResult: {
      hasVinData: boolean;
      dataQuality: number;
      responseTime: number;
      hasImages: boolean;
      hasPrice: boolean;
      hasAuctionInfo: boolean;
    },
  ): Promise<void> {
    const source = await this.model.findOne({ domain });
    if (!source) return;

    const checkCount = (source.checkCount || 0) + 1;
    const successCount = (source.successCount || 0) + (analysisResult.hasVinData ? 1 : 0);
    const failCount = (source.failCount || 0) + (analysisResult.hasVinData ? 0 : 1);

    // Calculate VIN coverage score
    const vinCoverageScore = checkCount > 0 ? successCount / checkCount : 0;

    // Calculate reliability score based on data quality
    let reliabilityScore = 0;
    if (analysisResult.hasVinData) {
      reliabilityScore = analysisResult.dataQuality * 0.4;
      if (analysisResult.hasImages) reliabilityScore += 0.2;
      if (analysisResult.hasPrice) reliabilityScore += 0.2;
      if (analysisResult.hasAuctionInfo) reliabilityScore += 0.2;
    }

    // Average with previous reliability score
    const newReliabilityScore = source.reliabilityScore > 0
      ? (source.reliabilityScore + reliabilityScore) / 2
      : reliabilityScore;

    await this.model.updateOne(
      { domain },
      {
        $set: {
          vinSupport: analysisResult.hasVinData || source.vinSupport,
          vinCoverageScore: Number(vinCoverageScore.toFixed(3)),
          reliabilityScore: Number(newReliabilityScore.toFixed(3)),
          lastCheckedAt: new Date(),
          metadata: {
            ...(source.metadata || {}),
            lastAnalysis: {
              vin,
              ...analysisResult,
              analyzedAt: new Date(),
            },
          },
        },
        $inc: {
          checkCount: 1,
          successCount: analysisResult.hasVinData ? 1 : 0,
          failCount: analysisResult.hasVinData ? 0 : 1,
        },
      },
    );

    this.logger.debug(
      `Analyzed ${domain}: vinSupport=${analysisResult.hasVinData}, ` +
      `reliability=${newReliabilityScore.toFixed(2)}`
    );
  }

  /**
   * Get all discovered sources
   */
  async getAll(): Promise<DiscoveredSource[]> {
    return this.model.find().sort({ reliabilityScore: -1 }).lean();
  }

  /**
   * Get sources ready for promotion to registry
   */
  async getPromotionCandidates(
    minReliability: number = 0.6,
    minCheckCount: number = 3,
  ): Promise<DiscoveredSource[]> {
    return this.model.find({
      vinSupport: true,
      reliabilityScore: { $gte: minReliability },
      checkCount: { $gte: minCheckCount },
      addedToRegistry: false,
    }).sort({ reliabilityScore: -1 }).lean();
  }

  /**
   * Mark source as added to registry
   */
  async markAsAddedToRegistry(domain: string): Promise<void> {
    await this.model.updateOne(
      { domain },
      {
        addedToRegistry: true,
        addedToRegistryAt: new Date(),
      },
    );
  }

  /**
   * Get discovery stats
   */
  async getStats(): Promise<{
    total: number;
    withVinSupport: number;
    promotionReady: number;
    addedToRegistry: number;
    avgReliability: number;
  }> {
    const all = await this.model.find().lean();
    const withVinSupport = all.filter(s => s.vinSupport);
    const promotionReady = all.filter(
      s => s.vinSupport && s.reliabilityScore >= 0.6 && !s.addedToRegistry
    );
    const addedToRegistry = all.filter(s => s.addedToRegistry);

    const avgReliability = withVinSupport.length > 0
      ? withVinSupport.reduce((sum, s) => sum + (s.reliabilityScore || 0), 0) / withVinSupport.length
      : 0;

    return {
      total: all.length,
      withVinSupport: withVinSupport.length,
      promotionReady: promotionReady.length,
      addedToRegistry: addedToRegistry.length,
      avgReliability: Number(avgReliability.toFixed(3)),
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  /**
   * Check if domain should be excluded
   */
  private isExcludedDomain(domain: string): boolean {
    const excluded = [
      'google.com',
      'bing.com',
      'duckduckgo.com',
      'yahoo.com',
      'facebook.com',
      'twitter.com',
      'youtube.com',
      'instagram.com',
      'linkedin.com',
      'wikipedia.org',
      'reddit.com',
    ];
    return excluded.some(ex => domain.includes(ex));
  }
}
