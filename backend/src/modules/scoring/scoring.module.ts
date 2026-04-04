/**
 * BIBI Cars - Scoring Module (Updated)
 * With persistent storage and controller
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScoringService } from './scoring.service';
import { ScoringController } from './scoring.controller';
import { ScoreHandler } from './score.handler';
import { ScoreSnapshot, ScoreSnapshotSchema } from './schemas/score-snapshot.schema';
import { ScoreRule, ScoreRuleSchema } from './schemas/score-rule.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScoreSnapshot.name, schema: ScoreSnapshotSchema },
      { name: ScoreRule.name, schema: ScoreRuleSchema },
    ]),
  ],
  providers: [ScoringService, ScoreHandler],
  controllers: [ScoringController],
  exports: [ScoringService],
})
export class ScoringModule {}
