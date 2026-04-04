/**
 * Parser Alert Repository
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParserAlert } from '../schemas/parser-alert.schema';
import { ParserAlertLevel, ParserAlertCode } from '../enums/parser-status.enum';

export interface CreateAlertDto {
  source: string;
  level: ParserAlertLevel;
  code: string;
  title: string;
  description?: string;
  meta?: Record<string, any>;
}

@Injectable()
export class ParserAlertRepository {
  constructor(
    @InjectModel(ParserAlert.name) private model: Model<ParserAlert>,
  ) {}

  async create(dto: CreateAlertDto): Promise<ParserAlert> {
    return this.model.create(dto);
  }

  async findAll(includeResolved = false) {
    const filter: any = {};
    if (!includeResolved) {
      filter.isResolved = false;
    }
    return this.model.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findBySource(source: string, includeResolved = false) {
    const filter: any = { source };
    if (!includeResolved) {
      filter.isResolved = false;
    }
    return this.model.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findActiveByCode(source: string, code: string) {
    return this.model.findOne({ 
      source, 
      code, 
      isResolved: false 
    }).lean();
  }

  async resolve(id: string, userId: string): Promise<ParserAlert | null> {
    return this.model.findOneAndUpdate(
      { id },
      {
        $set: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: userId,
        },
      },
      { new: true },
    );
  }

  async resolveByCode(source: string, code: string, userId: string): Promise<void> {
    await this.model.updateMany(
      { source, code, isResolved: false },
      {
        $set: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: userId,
        },
      },
    );
  }

  async countActive(): Promise<Record<string, number>> {
    const result = await this.model.aggregate([
      { $match: { isResolved: false } },
      { $group: { _id: '$level', count: { $sum: 1 } } },
    ]);

    return result.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);
  }
}
