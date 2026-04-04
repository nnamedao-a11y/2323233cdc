/**
 * Competitor Parsing Module
 * 
 * Deep parsing layer для отримання даних з конкурентів
 */

import { Module } from '@nestjs/common';
import { CompetitorParserService } from './competitor-parser.service';
import { CompetitorRunnerService } from './competitor-runner.service';
import { CompetitorParsingController } from './competitor-parsing.controller';
import { SourceRegistryModule } from '../source-registry/source-registry.module';

@Module({
  imports: [SourceRegistryModule],
  providers: [
    CompetitorParserService,
    CompetitorRunnerService,
  ],
  controllers: [CompetitorParsingController],
  exports: [CompetitorRunnerService, CompetitorParserService],
})
export class CompetitorParsingModule {}
