/**
 * Auction Ranking Cron
 * 
 * Scheduled tasks:
 * - Every 30 min: recompute rankings
 * - Every hour: deactivate expired auctions
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuctionRankingUpdateService } from './auction-ranking-update.service';

@Injectable()
export class AuctionRankingCron {
  private readonly logger = new Logger(AuctionRankingCron.name);

  constructor(
    private readonly rankingUpdateService: AuctionRankingUpdateService,
  ) {}

  /**
   * Recompute rankings every 30 minutes
   */
  @Cron('*/30 * * * *')
  async recomputeRankings() {
    this.logger.log('Running auction ranking recompute...');
    await this.rankingUpdateService.recomputeAllActive();
  }

  /**
   * Deactivate expired auctions every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async deactivateExpired() {
    this.logger.log('Checking for expired auctions...');
    await this.rankingUpdateService.deactivateExpiredAuctions();
  }
}
