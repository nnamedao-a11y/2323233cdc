/**
 * Pipeline Service - MAIN ORCHESTRATOR
 * 
 * Flow: Raw Data → Normalize → Dedup → Merge → Score → Save
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle } from '../ingestion/schemas/vehicle.schema';
import { NormalizeService } from './normalize.service';
import { DedupService } from './dedup.service';
import { MergeService } from './merge.service';
import { ScoringService } from './scoring.service';
import { AuctionClassifierService } from './auction-classifier.service';
import { generateId } from '../../shared/utils';
import { VehicleStatus } from '../ingestion/enums/vehicle.enum';

export interface PipelineResult {
  success: boolean;
  vehicleId: string | null;
  vin: string | null;
  action: 'created' | 'updated' | 'skipped';
  score: number;
  error?: string;
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private normalizeService: NormalizeService,
    private dedupService: DedupService,
    private mergeService: MergeService,
    private scoringService: ScoringService,
    private auctionClassifier: AuctionClassifierService,
    @InjectModel(Vehicle.name)
    private vehicleModel: Model<Vehicle>,
  ) {}

  /**
   * Process single raw item through pipeline
   */
  async process(raw: any, source: string = 'unknown'): Promise<PipelineResult> {
    try {
      // 1. Normalize
      const normalized = this.normalizeService.normalize(raw, source);

      if (!normalized.vin) {
        this.logger.warn(`[Pipeline] Skipped: no valid VIN`);
        return {
          success: false,
          vehicleId: null,
          vin: null,
          action: 'skipped',
          score: 0,
          error: 'No valid VIN',
        };
      }

      // 2. Dedup - check if exists
      const existing = await this.dedupService.findByVin(normalized.vin);

      let finalData: any;
      let action: 'created' | 'updated';

      if (existing) {
        // 3a. Merge with existing
        finalData = this.mergeService.merge(existing, normalized);
        action = 'updated';
        this.logger.debug(`[Pipeline] Merging VIN ${normalized.vin}`);
      } else {
        // 3b. New vehicle
        finalData = {
          id: generateId(),
          ...normalized,
          sources: [source],
          mergeCount: 1,
          status: VehicleStatus.ACTIVE,
        };
        action = 'created';
        this.logger.debug(`[Pipeline] Creating new VIN ${normalized.vin}`);
      }

      // 4. Auction classification
      const auctionInfo = this.auctionClassifier.classify(finalData);
      finalData.isAuction = auctionInfo.isAuction;
      finalData.saleStatus = auctionInfo.auctionStatus;
      if (auctionInfo.auctionDate) {
        finalData.auctionDate = auctionInfo.auctionDate;
      }

      // 5. Scoring
      const score = this.scoringService.score(finalData);
      finalData.score = score;
      finalData.confidenceLevel = this.scoringService.getConfidenceLevel(score);

      // 6. Save
      finalData.lastSyncedAt = new Date();
      finalData.syncCount = (existing?.syncCount || 0) + 1;

      const saved = await this.vehicleModel.findOneAndUpdate(
        { vin: normalized.vin },
        { $set: finalData },
        { upsert: true, new: true }
      );

      this.logger.log(`[Pipeline] ${action.toUpperCase()} VIN ${normalized.vin} (score: ${score})`);

      return {
        success: true,
        vehicleId: saved.id,
        vin: normalized.vin,
        action,
        score,
      };

    } catch (error: any) {
      this.logger.error(`[Pipeline] Error: ${error.message}`);
      return {
        success: false,
        vehicleId: null,
        vin: raw.vin || null,
        action: 'skipped',
        score: 0,
        error: error.message,
      };
    }
  }

  /**
   * Process batch of items
   */
  async processBatch(items: any[], source: string): Promise<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  }> {
    const results = {
      total: items.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const item of items) {
      const result = await this.process(item, source);
      
      if (result.action === 'created') results.created++;
      else if (result.action === 'updated') results.updated++;
      else results.skipped++;
      
      if (result.error) results.errors.push(result.error);
    }

    this.logger.log(
      `[Pipeline] Batch complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`
    );

    return results;
  }
}
