/**
 * Auction Ranking Module
 * 
 * Система ранжування аукціонів для публічного сайту
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Auction, AuctionSchema } from './auction.schema';
import { SourceRegistryModule } from '../source-registry/source-registry.module';
import { AuctionRankingService } from './auction-ranking.service';
import { AuctionRankingUpdateService } from './auction-ranking-update.service';
import { AuctionService } from './auction.service';
import { AuctionRankingCron } from './auction-ranking.cron';
import { AuctionRankingController } from './auction-ranking.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Auction.name, schema: AuctionSchema },
    ]),
    SourceRegistryModule,
  ],
  providers: [
    AuctionRankingService,
    AuctionRankingUpdateService,
    AuctionService,
    AuctionRankingCron,
  ],
  controllers: [AuctionRankingController],
  exports: [
    AuctionRankingService,
    AuctionRankingUpdateService,
    AuctionService,
  ],
})
export class AuctionRankingModule {}
