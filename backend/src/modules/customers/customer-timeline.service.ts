import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CustomerTimelineEvent, CustomerTimelineEventDocument } from './customer-timeline-event.schema';
import { Model } from 'mongoose';

/**
 * Customer Timeline Service
 * 
 * Керує всіма подіями клієнта для побудови timeline
 */

@Injectable()
export class CustomerTimelineService {
  constructor(
    @InjectModel(CustomerTimelineEvent.name)
    private readonly timelineModel: Model<CustomerTimelineEventDocument>,
  ) {}

  async addEvent(payload: {
    customerId: string;
    type: string;
    title?: string;
    description?: string;
    entityType?: string;
    entityId?: string;
    managerId?: string;
    meta?: Record<string, any>;
  }) {
    return this.timelineModel.create(payload);
  }

  async getByCustomerId(customerId: string, limit = 50) {
    return this.timelineModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async getRecentActivity(customerId: string) {
    return this.timelineModel
      .findOne({ customerId })
      .sort({ createdAt: -1 })
      .lean();
  }
}
