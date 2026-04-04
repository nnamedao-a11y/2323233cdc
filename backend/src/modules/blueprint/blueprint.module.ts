/**
 * BIBI Cars - Blueprint Module
 */

import { Module } from '@nestjs/common';
import { BlueprintService } from './blueprint.service';
import { BlueprintController } from './blueprint.controller';
import { BlueprintHandler } from './blueprint.handler';

@Module({
  providers: [BlueprintService, BlueprintHandler],
  controllers: [BlueprintController],
  exports: [BlueprintService],
})
export class BlueprintModule {}
