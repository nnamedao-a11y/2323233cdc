/**
 * VIN Resolver V2 Module
 * 
 * Інтегрований з ParsingMeshModule для вищого hit rate
 */

import { Module, forwardRef } from '@nestjs/common';
import { VinResolverV2Controller, SourceHealthController } from './vin-resolver-v2.controller';
import { VinResolverV2Service } from './vin-resolver-v2.service';
import { VinDiscoveryService } from './services/vin-discovery.service';
import { VinExtractionService } from './services/vin-extraction.service';
import { VinValidationService } from './services/vin-validation.service';
import { VinMergeService } from './services/vin-merge.service';
import { VinStatusService } from './services/vin-status.service';
import { VinPricingBridgeService } from './services/vin-pricing-bridge.service';
import { PuppeteerHtmlAdapter } from './services/puppeteer-html.adapter';
import { SourceHealthService } from './services/source-health.service';
import { ParsingMeshModule } from '../parsing-mesh/parsing-mesh.module';

@Module({
  imports: [forwardRef(() => ParsingMeshModule)],
  controllers: [VinResolverV2Controller, SourceHealthController],
  providers: [
    VinResolverV2Service,
    VinDiscoveryService,
    VinExtractionService,
    VinValidationService,
    VinMergeService,
    VinStatusService,
    VinPricingBridgeService,
    PuppeteerHtmlAdapter,
    SourceHealthService,
  ],
  exports: [VinResolverV2Service, SourceHealthService],
})
export class VinResolverV2Module {}
