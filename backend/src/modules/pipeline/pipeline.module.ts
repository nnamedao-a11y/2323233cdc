/**
 * Pipeline Module
 * 
 * Data processing pipeline: normalize → dedup → merge → score
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vehicle, VehicleSchema } from '../ingestion/schemas/vehicle.schema';
import { NormalizeService } from './normalize.service';
import { DedupService } from './dedup.service';
import { MergeService } from './merge.service';
import { ScoringService } from './scoring.service';
import { AuctionClassifierService } from './auction-classifier.service';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vehicle.name, schema: VehicleSchema },
    ]),
  ],
  providers: [
    NormalizeService,
    DedupService,
    MergeService,
    ScoringService,
    AuctionClassifierService,
    PipelineService,
  ],
  exports: [
    PipelineService,
    NormalizeService,
    DedupService,
    MergeService,
    ScoringService,
    AuctionClassifierService,
  ],
})
export class PipelineModule {}
