import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from './audit-log.schema';
import { AuditAction, EntityType } from '../../shared/enums';
import { generateId, toArrayResponse } from '../../shared/utils';
import { PaginationDto, PaginatedResult } from '../../shared/dto/pagination.dto';

interface CreateAuditLogDto {
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  userId: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLog>,
  ) {}

  async log(data: CreateAuditLogDto): Promise<void> {
    const log = new this.auditLogModel({
      id: generateId(),
      ...data,
    });
    await log.save();
  }

  async findAll(
    query: PaginationDto & {
      userId?: string;
      entityType?: EntityType;
      action?: AuditAction;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 50, userId, entityType, action, startDate, endDate } = query;

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (entityType) filter.entityType = entityType;
    if (action) filter.action = action;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return {
      data: toArrayResponse(logs),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByEntity(entityType: EntityType, entityId: string): Promise<any[]> {
    const logs = await this.auditLogModel
      .find({ entityType, entityId })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
    return toArrayResponse(logs);
  }
}
