import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Activity } from '../schemas/activity.schema';
import { CreateActivityDto } from '../dto/create-activity.dto';
import { QueryActivityDto } from '../dto/query-activity.dto';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../enums/activity-action.enum';
import { generateId, toObjectResponse, toArrayResponse } from '../../../shared/utils';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
  ) {}

  // Основний метод логування - асинхронний, не блокує основний flow
  async log(data: CreateActivityDto): Promise<Activity> {
    try {
      const activity = new this.activityModel({
        id: generateId(),
        ...data,
        context: {
          ...data.context,
          source: data.context?.source || ActivitySource.WEB,
        },
      });
      return await activity.save();
    } catch (error) {
      this.logger.error(`Failed to log activity: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Неблокуюче логування через setImmediate
  logAsync(data: CreateActivityDto): void {
    setImmediate(async () => {
      try {
        await this.log(data);
      } catch (error) {
        this.logger.error(`Async activity log failed: ${error.message}`);
      }
    });
  }

  // Отримати активності за фільтрами
  async findAll(query: QueryActivityDto): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const filter: any = {};
    
    if (query.userId) filter.userId = query.userId;
    if (query.action) filter.action = query.action;
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    const limit = Math.min(query.limit || 50, 100);
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.activityModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.activityModel.countDocuments(filter),
    ]);

    return {
      data: toArrayResponse(data),
      total,
      page,
      limit,
    };
  }

  // Активності конкретного користувача
  async getUserActivity(userId: string, limit = 50): Promise<any[]> {
    const activities = await this.activityModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toArrayResponse(activities);
  }

  // Активності по сутності (lead, deal, etc)
  async getEntityActivity(entityType: ActivityEntityType, entityId: string, limit = 50): Promise<any[]> {
    const activities = await this.activityModel
      .find({ entityType, entityId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toArrayResponse(activities);
  }

  // Системні активності
  async getSystemActivity(startDate?: Date, endDate?: Date, limit = 100): Promise<any[]> {
    const filter: any = {
      action: { $in: [ActivityAction.SYSTEM_ERROR, ActivityAction.SLA_BREACH] },
    };
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = startDate;
      if (endDate) filter.createdAt.$lte = endDate;
    }

    const activities = await this.activityModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toArrayResponse(activities);
  }

  // Останні активності (для дашборду)
  async getRecentActivity(limit = 20): Promise<any[]> {
    const activities = await this.activityModel
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toArrayResponse(activities);
  }
}
