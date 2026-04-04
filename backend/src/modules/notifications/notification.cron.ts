import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CooldownService } from './cooldown.service';

/**
 * Notification Cron Jobs
 * 
 * Scheduled tasks for proactive notifications:
 * - Auction soon alerts
 * - Waiting deposit timeouts
 * - Price change detection
 */

@Injectable()
export class NotificationCron {
  private readonly logger = new Logger(NotificationCron.name);

  constructor(
    @InjectModel('VehicleListing')
    private readonly listingModel: Model<any>,
    @InjectModel('CustomerSavedListing')
    private readonly savedModel: Model<any>,
    @InjectModel('Deal')
    private readonly dealModel: Model<any>,
    private readonly eventEmitter: EventEmitter2,
    private readonly cooldownService: CooldownService,
  ) {}

  /**
   * Check for upcoming auctions (every 15 minutes)
   * Alert users who saved listings with auctions starting within 6 hours
   */
  @Cron('*/15 * * * *')
  async checkUpcomingAuctions() {
    this.logger.log('Checking upcoming auctions...');

    const now = new Date();
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    try {
      // Find listings with auctions starting soon
      const upcomingListings = await this.listingModel.find({
        auctionDate: {
          $gte: now,
          $lte: sixHoursLater,
        },
        isPublished: true,
        status: 'published',
      }).lean();

      for (const listing of upcomingListings) {
        // Find users who saved this listing
        const savedBy = await this.savedModel.find({
          listingId: listing.id || String(listing._id),
        }).lean();

        for (const saved of savedBy) {
          const hoursLeft = Math.round(
            (new Date(listing.auctionDate).getTime() - now.getTime()) / (1000 * 60 * 60)
          );

          this.eventEmitter.emit('listing.auction_soon', {
            customerId: saved.customerId,
            listingId: listing.id || String(listing._id),
            title: `${listing.year || ''} ${listing.make || ''} ${listing.model || ''}`.trim(),
            timeLeft: hoursLeft <= 1 ? 'менше 1 години' : `${hoursLeft} год.`,
            auctionDate: listing.auctionDate,
            link: `/cars/${listing.slug || listing.id}`,
          });
        }
      }

      this.logger.log(`Processed ${upcomingListings.length} upcoming auctions`);
    } catch (error) {
      this.logger.error(`Auction check failed: ${error.message}`);
    }
  }

  /**
   * Check for deals waiting deposit too long (every hour)
   */
  @Cron('0 * * * *')
  async checkWaitingDeposits() {
    this.logger.log('Checking waiting deposits...');

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const waitingDeals = await this.dealModel.find({
        status: 'waiting_deposit',
        updatedAt: { $lte: twentyFourHoursAgo },
      }).lean();

      for (const deal of waitingDeals) {
        const hoursWaiting = Math.round(
          (Date.now() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60)
        );

        this.eventEmitter.emit('deal.waiting_deposit_timeout', {
          managerId: deal.managerId,
          dealId: deal.id || String(deal._id),
          customerName: deal.customerName || 'Клієнт',
          vehicleTitle: `${deal.vehicleYear || ''} ${deal.vehicleMake || ''} ${deal.vehicleModel || ''}`.trim(),
          waitingHours: hoursWaiting,
        });
      }

      this.logger.log(`Found ${waitingDeals.length} deals waiting deposits`);
    } catch (error) {
      this.logger.error(`Waiting deposit check failed: ${error.message}`);
    }
  }

  /**
   * Cleanup old cooldown entries (daily at 3:00 AM)
   */
  @Cron('0 3 * * *')
  async cleanupCooldowns() {
    this.logger.log('Cleaning up cooldowns...');
    this.cooldownService.cleanup();
  }

  /**
   * Check for price changes (every 30 minutes)
   */
  @Cron('*/30 * * * *')
  async checkPriceChanges() {
    this.logger.log('Checking price changes...');

    try {
      // Find listings with recent price changes
      const recentChanges = await this.listingModel.find({
        priceChangedAt: {
          $gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
        },
        isPublished: true,
        status: 'published',
      }).lean();

      for (const listing of recentChanges) {
        if (!listing.previousPrice || !listing.currentBid) continue;
        
        const isDrop = listing.currentBid < listing.previousPrice;
        if (!isDrop) continue;

        // Find users who saved this listing
        const savedBy = await this.savedModel.find({
          listingId: listing.id || String(listing._id),
        }).lean();

        for (const saved of savedBy) {
          this.eventEmitter.emit('listing.price_changed', {
            customerId: saved.customerId,
            listingId: listing.id || String(listing._id),
            title: `${listing.year || ''} ${listing.make || ''} ${listing.model || ''}`.trim(),
            oldPrice: listing.previousPrice,
            newPrice: listing.currentBid,
            isDrop: true,
            link: `/cars/${listing.slug || listing.id}`,
          });
        }
      }

      this.logger.log(`Processed ${recentChanges.length} price changes`);
    } catch (error) {
      this.logger.error(`Price change check failed: ${error.message}`);
    }
  }
}
