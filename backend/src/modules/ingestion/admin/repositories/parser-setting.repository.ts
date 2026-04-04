/**
 * Parser Setting Repository
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParserSetting } from '../schemas/parser-setting.schema';
import { UpdateParserSettingsDto } from '../dto/parser-admin.dto';

@Injectable()
export class ParserSettingRepository {
  constructor(
    @InjectModel(ParserSetting.name) private model: Model<ParserSetting>,
  ) {}

  async findAll() {
    return this.model.find().lean();
  }

  async findBySource(source: string) {
    return this.model.findOne({ source }).lean();
  }

  async update(
    source: string, 
    dto: UpdateParserSettingsDto, 
    userId?: string,
  ) {
    return this.model.findOneAndUpdate(
      { source },
      { 
        $set: { 
          ...dto, 
          updatedBy: userId,
        } 
      },
      { upsert: true, new: true },
    );
  }

  async initializeDefaults(source: string) {
    const existing = await this.findBySource(source);
    if (existing) return existing;

    return this.model.create({
      source,
      enabled: true,
      cronExpression: source === 'copart' ? '0 */4 * * *' : '30 */4 * * *',
      timeoutMs: 30000,
      maxRetries: 3,
      useProxies: true,
      useFingerprint: true,
      useCircuitBreaker: true,
      maxPages: 5,
      scrollCount: 3,
      waitTimeMs: 2000,
      autoRestartOnFailure: false,
      autoRestartFailureThreshold: 3,
      saveRawPayloads: true,
      enableAlerts: true,
    });
  }
}
