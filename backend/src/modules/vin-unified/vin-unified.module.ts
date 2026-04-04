/**
 * VIN Unified Module
 * 
 * ЄДИНИЙ ENTRYPOINT для всієї VIN логіки
 * ТІЛЬКИ СКРАПІНГ - БЕЗ API ІНТЕГРАЦІЙ
 * 
 * Flow:
 * VIN → Validation → Cache Check → Discovery (parallel) → 
 * Smart Orchestration (tiered) → Extraction → Validation → Merge → Scoring → Result
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Controllers
import { VinUnifiedController } from './vin-unified.controller';
import { VinDashboardController } from './controllers/vin-dashboard.controller';

// Services
import { VinUnifiedService } from './vin-unified.service';
import { VinDiscoveryService } from './discovery/discovery.service';
import { VinExtractionService } from './extraction/extraction.service';
import { VinValidationService } from './validation/validation.service';
import { VinMergeService } from './merge/merge.service';
import { VinScoringService } from './scoring/scoring.service';
import { SourceScoringService } from './scoring/source-scoring.service';
import { VinCacheService } from './cache/cache.service';

// Smart Orchestration & Anti-Block
import { EarlyReturnService } from './adapters/early-return.service';
import { SmartOrchestratorService } from './adapters/smart-orchestrator.service';
import { SourceHealthTracker } from './anti-block/source-health-tracker';
import { DynamicWeightEngine } from './anti-block/dynamic-weight.engine';
import { HealthAwareTierFactory } from './anti-block/health-aware-tier.factory';

// Fallback Layer
import { FallbackEngine } from './fallback/fallback-engine.service';
import { FallbackStrategyService } from './fallback/fallback-strategy.service';

// Adapters (SCRAPING ONLY)
import { JsonAdapter } from './adapters/json.adapter';
import { HtmlLightAdapter } from './adapters/html-light.adapter';
import { HtmlHeavyAdapter } from './adapters/html-heavy.adapter';
import { StealthAdapter } from './adapters/stealth.adapter';
import { LocalVinDecoder } from './adapters/local-decoder.adapter';
import { AdapterRegistry } from './adapters/adapter.registry';

// Schemas
import { VinCache, VinCacheSchema } from './cache/vin-cache.schema';
import { VinSource, VinSourceSchema } from './discovery/vin-source.schema';

// External
import { Vehicle, VehicleSchema } from '../ingestion/schemas/vehicle.schema';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VinCache.name, schema: VinCacheSchema },
      { name: VinSource.name, schema: VinSourceSchema },
      { name: Vehicle.name, schema: VehicleSchema },
    ]),
    LeadsModule,
  ],
  controllers: [VinUnifiedController, VinDashboardController],
  providers: [
    VinUnifiedService,
    VinDiscoveryService,
    VinExtractionService,
    VinValidationService,
    VinMergeService,
    VinScoringService,
    SourceScoringService,
    VinCacheService,
    // Smart Orchestration & Anti-Block
    EarlyReturnService,
    SmartOrchestratorService,
    SourceHealthTracker,
    DynamicWeightEngine,
    HealthAwareTierFactory,
    // Fallback Layer
    FallbackEngine,
    FallbackStrategyService,
    // Adapters (SCRAPING ONLY - NO API)
    JsonAdapter,
    HtmlLightAdapter,
    HtmlHeavyAdapter,
    StealthAdapter, // Puppeteer with stealth plugin for Cloudflare bypass
    LocalVinDecoder,
    AdapterRegistry,
  ],
  exports: [VinUnifiedService, SourceHealthTracker, DynamicWeightEngine],
})
export class VinUnifiedModule {}
