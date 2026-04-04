/**
 * Source Discovery Module
 * 
 * Автоматичний пошук та онбординг нових VIN джерел
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DiscoveredSource, DiscoveredSourceSchema } from './discovered-source.schema';
import { SourceDiscoveryService } from './source-discovery.service';
import { SourceOnboardingService } from './source-onboarding.service';
import { SourceDiscoveryCron } from './source-discovery.cron';
import { SourceDiscoveryController } from './source-discovery.controller';
import { SourceRegistryModule } from '../source-registry/source-registry.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DiscoveredSource.name, schema: DiscoveredSourceSchema },
    ]),
    SourceRegistryModule,
  ],
  providers: [
    SourceDiscoveryService,
    SourceOnboardingService,
    SourceDiscoveryCron,
  ],
  controllers: [SourceDiscoveryController],
  exports: [SourceDiscoveryService, SourceOnboardingService],
})
export class SourceDiscoveryModule {}
