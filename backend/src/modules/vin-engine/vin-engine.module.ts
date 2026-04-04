/**
 * VIN Engine Module
 * 
 * VIN Intelligence Engine for 100% coverage
 * Multi-source provider architecture:
 * DB → Cache → Aggregators → Competitors → Web Search → Merge → Score
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vehicle, VehicleSchema } from '../ingestion/schemas/vehicle.schema';
import { Auction, AuctionSchema } from '../auction-ranking/auction.schema';
import { VinCache, VinCacheSchema } from './vin-cache.service';
import { SearchProviderService } from './search.provider';
import { UrlFilterService } from './url-filter.service';
import { ExtractorService } from './extractor.service';
import { VinMergeService } from './vin-merge.service';
import { VinCacheService } from './vin-cache.service';
import { VinSearchService } from './vin-search.service';
import { VinSearchController } from './vin-search.controller';
import { PublicVinController } from './public-vin.controller';
import { PipelineModule } from '../pipeline/pipeline.module';
import { LeadsModule } from '../leads/leads.module';
import { SourceDiscoveryModule } from '../source-discovery/source-discovery.module';
import { CompetitorParsingModule } from '../competitor-parsing/competitor-parsing.module';
import { AuctionRankingModule } from '../auction-ranking/auction-ranking.module';

// New provider-based architecture
import { SourceWeightService } from './providers/source-weight.service';
import { VinCandidateScoringService } from './providers/vin-candidate-scoring.service';
import { ResultMergeService } from './providers/result-merge.service';
import { DbVinSearchProvider } from './providers/db.provider';
import { AggregatorSearchProvider } from './providers/aggregator-search.provider';
import { CompetitorSearchProvider } from './providers/competitor-search.provider';
import { VinSearchOrchestratorService } from './providers/vin-search-orchestrator.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vehicle.name, schema: VehicleSchema },
      { name: Auction.name, schema: AuctionSchema },
      { name: VinCache.name, schema: VinCacheSchema },
    ]),
    PipelineModule,
    forwardRef(() => LeadsModule),
    SourceDiscoveryModule,
    CompetitorParsingModule,
    AuctionRankingModule,
  ],
  controllers: [VinSearchController, PublicVinController],
  providers: [
    // Existing services
    SearchProviderService,
    UrlFilterService,
    ExtractorService,
    VinMergeService,
    VinCacheService,
    VinSearchService,
    
    // New provider-based services
    SourceWeightService,
    VinCandidateScoringService,
    ResultMergeService,
    DbVinSearchProvider,
    AggregatorSearchProvider,
    CompetitorSearchProvider,
    VinSearchOrchestratorService,
  ],
  exports: [VinSearchService, VinCacheService, VinSearchOrchestratorService],
})
export class VinEngineModule {}
