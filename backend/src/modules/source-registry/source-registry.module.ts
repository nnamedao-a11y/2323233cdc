/**
 * Source Registry Module
 * 
 * Керування джерелами VIN + Auto-Optimization Engine
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Source, SourceSchema } from './source.schema';
import { SourceRegistryService } from './source-registry.service';
import { SourceRegistryController } from './source-registry.controller';
import { SourceOptimizationService } from './source-optimization.service';
import { SourceOptimizationCron } from './source-optimization.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Source.name, schema: SourceSchema },
    ]),
  ],
  providers: [
    SourceRegistryService,
    SourceOptimizationService,
    SourceOptimizationCron,
  ],
  controllers: [SourceRegistryController],
  exports: [SourceRegistryService, SourceOptimizationService],
})
export class SourceRegistryModule {}
