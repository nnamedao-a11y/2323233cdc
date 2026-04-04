import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';

/**
 * Track Event DTO
 */
export interface TrackEventDto {
  event: string;
  sessionId?: string;
  customerId?: string;
  url?: string;
  referrer?: string;
  userAgent?: string;
  utm?: {
    source?: string;
    campaign?: string;
    medium?: string;
  };
  data?: Record<string, any>;
  duration?: number;
  hasInteraction?: boolean;
  ts?: number;
  ip?: string;
  isFake?: boolean;
}

/**
 * Analytics Tracking Service
 * 
 * Handles event collection with buffer/batch writes
 */
@Injectable()
export class AnalyticsTrackingService {
  private readonly logger = new Logger(AnalyticsTrackingService.name);
  private buffer: TrackEventDto[] = [];
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 10000; // 10 seconds

  constructor(
    @InjectModel('AnalyticsEvent') private analyticsModel: Model<any>,
  ) {}

  /**
   * Track event (buffered)
   */
  track(event: TrackEventDto): void {
    // Detect fake traffic
    const isFake = this.detectFake(event);
    
    this.buffer.push({
      ...event,
      isFake,
    });

    // Flush if buffer is full
    if (this.buffer.length >= this.BUFFER_SIZE) {
      this.flush();
    }
  }

  /**
   * Flush buffer to database
   */
  @Cron('*/10 * * * * *') // Every 10 seconds
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      await this.analyticsModel.insertMany(events, { ordered: false });
      this.logger.debug(`Flushed ${events.length} analytics events`);
    } catch (error) {
      this.logger.error(`Error flushing analytics: ${error.message}`);
      // Re-add failed events to buffer (optional)
    }
  }

  /**
   * Detect fake traffic
   */
  private detectFake(event: TrackEventDto): boolean {
    // No user agent
    if (!event.userAgent) return true;
    
    // Very short duration (bot)
    if (event.duration !== undefined && event.duration < 2) return true;
    
    // No interaction on long visit (bot)
    if (event.duration && event.duration > 60 && !event.hasInteraction) return true;
    
    // Known bot user agents
    const botPatterns = ['bot', 'crawler', 'spider', 'headless', 'phantom'];
    if (botPatterns.some(p => event.userAgent?.toLowerCase().includes(p))) return true;
    
    return false;
  }

  /**
   * Count events by type
   */
  async countEvents(event: string, startDate?: Date): Promise<number> {
    const filter: any = { event, isFake: false };
    if (startDate) {
      filter.createdAt = { $gte: startDate };
    }
    return this.analyticsModel.countDocuments(filter);
  }

  /**
   * Get events grouped by source
   */
  async getBySource(startDate?: Date): Promise<any[]> {
    const match: any = { isFake: false };
    if (startDate) {
      match.createdAt = { $gte: startDate };
    }

    return this.analyticsModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$utm.source',
          visits: { $sum: 1 },
          uniqueSessions: { $addToSet: '$sessionId' },
        },
      },
      {
        $project: {
          source: { $ifNull: ['$_id', 'direct'] },
          visits: 1,
          uniqueSessions: { $size: '$uniqueSessions' },
        },
      },
      { $sort: { visits: -1 } },
      { $limit: 20 },
    ]);
  }

  /**
   * Get timeline data
   */
  async getTimeline(days: number = 30, event?: string): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const match: any = { isFake: false, createdAt: { $gte: startDate } };
    if (event) {
      match.event = event;
    }

    return this.analyticsModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            event: '$event',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          events: {
            $push: {
              event: '$_id.event',
              count: '$count',
            },
          },
          total: { $sum: '$count' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  /**
   * Get fake traffic count
   */
  async getFakeTrafficCount(startDate?: Date): Promise<number> {
    const filter: any = { isFake: true };
    if (startDate) {
      filter.createdAt = { $gte: startDate };
    }
    return this.analyticsModel.countDocuments(filter);
  }

  /**
   * Link session to customer
   */
  async linkSessionToCustomer(sessionId: string, customerId: string): Promise<void> {
    await this.analyticsModel.updateMany(
      { sessionId, customerId: { $exists: false } },
      { $set: { customerId } },
    );
  }
}
