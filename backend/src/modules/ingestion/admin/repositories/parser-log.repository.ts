/**
 * Parser Log Repository
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParserLog } from '../schemas/parser-log.schema';
import { ParserLogLevel } from '../enums/parser-status.enum';

export interface CreateLogDto {
  source: string;
  level: ParserLogLevel;
  event: string;
  message?: string;
  proxyId?: string;
  proxyServer?: string;
  externalId?: string;
  vin?: string;
  durationMs?: number;
  meta?: Record<string, any>;
}

export interface LogQuery {
  source?: string;
  level?: ParserLogLevel;
  event?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ParserLogRepository {
  constructor(
    @InjectModel(ParserLog.name) private model: Model<ParserLog>,
  ) {}

  async create(dto: CreateLogDto): Promise<ParserLog> {
    return this.model.create(dto);
  }

  async findAll(query: LogQuery = {}) {
    const { source, level, event, page = 1, limit = 50 } = query;
    
    const filter: any = {};
    if (source) filter.source = source;
    if (level) filter.level = level;
    if (event) filter.event = event;

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findBySource(source: string, limit = 50) {
    const docs = await this.model
      .find({ source })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs;
  }

  async findErrors(source?: string, limit = 100) {
    const filter: any = { level: ParserLogLevel.ERROR };
    if (source) filter.source = source;

    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs;
  }

  async countByLevelLastHour(source?: string): Promise<Record<string, number>> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const filter: any = { createdAt: { $gte: oneHourAgo } };
    if (source) filter.source = source;

    const result = await this.model.aggregate([
      { $match: filter },
      { $group: { _id: '$level', count: { $sum: 1 } } },
    ]);

    return result.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);
  }
}
