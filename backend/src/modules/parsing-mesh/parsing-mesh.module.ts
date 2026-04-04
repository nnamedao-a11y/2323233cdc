/**
 * Parsing Mesh Module
 * 
 * Production-ready parsing system з:
 * - 5 типів адаптерів (html, search_form, google, json, nhtsa)
 * - Source Registry з lifecycle management
 * - Truth Merge Engine
 * - Validation Engine
 * - CRON автовалідація
 * - Test Lab Controller
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { MeshSource, MeshSourceSchema } from './sources/source.schema';

// Services
import { SourceService } from './sources/source.service';
import { TruthMergeService } from './merge/truth-merge.service';
import { ValidationService } from './validation/validation.service';
import { QualityLayerService } from './validation/quality-layer.service';
import { VinOrchestratorService } from './orchestrator/vin-orchestrator.service';

// CRON
import { SourceValidationCron } from './cron/source-validation.cron';

// Adapters
import { AdapterRegistry } from './adapters/adapter.registry';
import { HtmlDetailAdapter } from './adapters/html/html-detail.adapter';
import { SearchFormAdapter } from './adapters/search-form/search-form.adapter';
import { GoogleMentionAdapter } from './adapters/google/google-mention.adapter';
import { JsonApiAdapter } from './adapters/json/json-api.adapter';
import { NhtsaAdapter } from './adapters/nhtsa/nhtsa.adapter';

// Controllers
import { ParserTestController } from './test-lab/parser-test.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MeshSource.name, schema: MeshSourceSchema },
    ]),
  ],
  providers: [
    // Core Services
    SourceService,
    TruthMergeService,
    ValidationService,
    QualityLayerService,
    VinOrchestratorService,
    
    // CRON Jobs
    SourceValidationCron,
    
    // Adapters
    HtmlDetailAdapter,
    SearchFormAdapter,
    GoogleMentionAdapter,
    JsonApiAdapter,
    NhtsaAdapter,
    AdapterRegistry,
  ],
  controllers: [
    ParserTestController,
  ],
  exports: [
    SourceService,
    VinOrchestratorService,
    TruthMergeService,
    AdapterRegistry,
    ValidationService,
  ],
})
export class ParsingMeshModule {}
