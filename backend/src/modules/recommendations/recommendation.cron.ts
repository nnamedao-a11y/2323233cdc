import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RecommendationService, RecommendationType } from './recommendation.service';
import { RecommendationProfileService } from './recommendation-profile.service';

/**
 * Recommendation CRON Jobs
 * 
 * Automated triggers for sending recommendations:
 * - Every 6 hours: Check active users for new recommendations
 * - Every 2 hours: Auction-soon alerts
 * - Daily: "You missed this" for users who saved but didn't buy
 */
@Injectable()
export class RecommendationCronService {
  private readonly logger = new Logger(RecommendationCronService.name);

  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly profileService: RecommendationProfileService,
    @InjectModel('Customer') private customerModel: Model<any>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Send personalized recommendations every 6 hours
   * 09:00, 15:00, 21:00
   */
  @Cron('0 9,15,21 * * *')
  async sendPeriodicRecommendations() {
    this.logger.log('Starting periodic recommendation job...');
    
    try {
      // Get active customers (with activity in last 14 days)
      const activeCustomers = await this.getActiveCustomers(14);
      this.logger.log(`Found ${activeCustomers.length} active customers`);

      let sent = 0;
      let skipped = 0;

      for (const customer of activeCustomers) {
        try {
          // Check if user is active recently
          const isActive = await this.profileService.isUserActive(customer.id, 7);
          if (!isActive) {
            skipped++;
            continue;
          }

          // Get recommendations
          const recommendations = await this.recommendationService.getRecommendations(
            customer.id,
            3,
          );

          if (recommendations.length === 0) {
            skipped++;
            continue;
          }

          // Pick the best one
          const best = recommendations[0];
          const listing = best.listing;

          // Emit notification event
          this.eventEmitter.emit('recommendation.generated', {
            customerId: customer.id,
            type: best.type,
            title: this.getNotificationTitle(best.type),
            message: this.formatRecommendationMessage(best),
            priority: this.getRecommendationPriority(best.type),
            meta: {
              listingId: listing.id,
              listingTitle: `${listing.make} ${listing.model} ${listing.year || ''}`.trim(),
              price: listing.currentBid || listing.buyNowPrice,
              reason: best.reason,
              link: `/cars/${listing.slug || listing.id}`,
            },
          });

          sent++;
        } catch (error) {
          this.logger.error(`Error processing customer ${customer.id}: ${error.message}`);
        }

        // Rate limiting - don't overwhelm the system
        await this.sleep(100);
      }

      this.logger.log(`Recommendation job complete: ${sent} sent, ${skipped} skipped`);
    } catch (error) {
      this.logger.error(`Recommendation job failed: ${error.message}`);
    }
  }

  /**
   * Send auction-soon alerts every 2 hours
   */
  @Cron('0 */2 * * *')
  async sendAuctionSoonAlerts() {
    this.logger.log('Starting auction-soon alert job...');

    try {
      const activeCustomers = await this.getActiveCustomers(30);
      let sent = 0;

      for (const customer of activeCustomers) {
        try {
          const recommendations = await this.recommendationService.getAuctionSoonRecommendations(
            customer.id,
            6, // Next 6 hours
            1,
          );

          if (recommendations.length === 0) continue;

          const rec = recommendations[0];
          const listing = rec.listing;

          this.eventEmitter.emit('recommendation.auction_soon', {
            customerId: customer.id,
            type: RecommendationType.AUCTION_SOON,
            title: 'Auction Starting Soon!',
            message: this.formatAuctionSoonMessage(rec),
            priority: 9, // High priority
            meta: {
              listingId: listing.id,
              listingTitle: `${listing.make} ${listing.model}`,
              auctionDate: listing.auctionDate,
              price: listing.currentBid,
              link: `/cars/${listing.slug || listing.id}`,
            },
          });

          sent++;
        } catch (error) {
          this.logger.error(`Auction alert error for ${customer.id}: ${error.message}`);
        }

        await this.sleep(50);
      }

      this.logger.log(`Auction-soon job complete: ${sent} alerts sent`);
    } catch (error) {
      this.logger.error(`Auction-soon job failed: ${error.message}`);
    }
  }

  /**
   * Send "You Missed This" daily at 10:00
   */
  @Cron('0 10 * * *')
  async sendYouMissedAlerts() {
    this.logger.log('Starting "You Missed This" job...');

    try {
      // Get customers who saved listings in last 7 days but didn't make a deal
      const customers = await this.getCustomersWithSavedButNoDeal(7);
      let sent = 0;

      for (const customer of customers) {
        try {
          const recommendations = await this.recommendationService.getYouMissedRecommendations(
            customer.id,
            1,
          );

          if (recommendations.length === 0) continue;

          const rec = recommendations[0];
          const listing = rec.listing;

          this.eventEmitter.emit('recommendation.you_missed', {
            customerId: customer.id,
            type: RecommendationType.YOU_MISSED,
            title: 'Similar Car, Better Price!',
            message: rec.reason,
            priority: 7,
            meta: {
              listingId: listing.id,
              listingTitle: `${listing.make} ${listing.model}`,
              price: listing.currentBid,
              link: `/cars/${listing.slug || listing.id}`,
            },
          });

          sent++;
        } catch (error) {
          this.logger.error(`You-missed error for ${customer.id}: ${error.message}`);
        }

        await this.sleep(100);
      }

      this.logger.log(`"You Missed This" job complete: ${sent} alerts sent`);
    } catch (error) {
      this.logger.error(`"You Missed This" job failed: ${error.message}`);
    }
  }

  // ============ HELPERS ============

  private async getActiveCustomers(days: number): Promise<any[]> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);

    return this.customerModel
      .find({
        isDeleted: false,
        $and: [
          {
            $or: [
              { lastInteractionAt: { $gte: threshold } },
              { createdAt: { $gte: threshold } },
            ],
          },
          {
            // Must have Telegram or Viber linked for notifications
            $or: [
              { telegramId: { $exists: true, $ne: null } },
              { viberId: { $exists: true, $ne: null } },
            ],
          },
        ],
      })
      .select('id email name telegramId viberId')
      .limit(500)
      .lean();
  }

  private async getCustomersWithSavedButNoDeal(days: number): Promise<any[]> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);

    // Get customers who saved something recently
    const customersWithSaved = await this.customerModel.aggregate([
      {
        $lookup: {
          from: 'customersavedlistings',
          localField: 'id',
          foreignField: 'customerId',
          as: 'saved',
        },
      },
      {
        $match: {
          isDeleted: false,
          'saved.createdAt': { $gte: threshold },
          $or: [
            { telegramId: { $exists: true, $ne: null } },
            { viberId: { $exists: true, $ne: null } },
          ],
        },
      },
      {
        $lookup: {
          from: 'deals',
          localField: 'id',
          foreignField: 'customerId',
          as: 'deals',
        },
      },
      {
        $match: {
          $or: [
            { deals: { $size: 0 } },
            { 'deals.createdAt': { $lt: threshold } },
          ],
        },
      },
      {
        $project: { id: 1, email: 1, name: 1, telegramId: 1, viberId: 1 },
      },
      { $limit: 200 },
    ]);

    return customersWithSaved;
  }

  private getNotificationTitle(type: RecommendationType): string {
    const titles: Record<RecommendationType, string> = {
      [RecommendationType.SIMILAR]: 'New Car For You',
      [RecommendationType.GOOD_DEAL]: 'Great Deal Alert!',
      [RecommendationType.UPGRADE]: 'Premium Pick',
      [RecommendationType.YOU_MISSED]: 'Similar But Cheaper!',
      [RecommendationType.AUCTION_SOON]: 'Auction Soon!',
    };
    return titles[type] || 'Recommendation';
  }

  private getRecommendationPriority(type: RecommendationType): number {
    const priorities: Record<RecommendationType, number> = {
      [RecommendationType.AUCTION_SOON]: 9,
      [RecommendationType.GOOD_DEAL]: 8,
      [RecommendationType.YOU_MISSED]: 7,
      [RecommendationType.SIMILAR]: 5,
      [RecommendationType.UPGRADE]: 5,
    };
    return priorities[type] || 5;
  }

  private formatRecommendationMessage(rec: any): string {
    const listing = rec.listing;
    const price = listing.currentBid || listing.buyNowPrice || 0;
    
    let emoji = '';
    if (rec.priceTag === 'good_deal') emoji = '';
    else if (rec.priceTag === 'upgrade') emoji = '';
    else emoji = '';

    return `${emoji} ${listing.make} ${listing.model} ${listing.year || ''}\n$${price.toLocaleString()}\n\n${rec.reason}`;
  }

  private formatAuctionSoonMessage(rec: any): string {
    const listing = rec.listing;
    const price = listing.currentBid || 0;
    const auctionDate = new Date(listing.auctionDate);
    const hoursLeft = Math.round((auctionDate.getTime() - Date.now()) / (1000 * 60 * 60));

    return `${listing.make} ${listing.model} ${listing.year || ''}\n$${price.toLocaleString()}\n\nAuction in ${hoursLeft} hours!`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
