/**
 * Parser Settings Service
 */

import { Injectable } from '@nestjs/common';
import { ParserSettingRepository } from '../repositories/parser-setting.repository';
import { UpdateParserSettingsDto } from '../dto/parser-admin.dto';

@Injectable()
export class ParserSettingsService {
  constructor(private readonly repo: ParserSettingRepository) {}

  async getAll() {
    return this.repo.findAll();
  }

  async getBySource(source: string) {
    return this.repo.findBySource(source);
  }

  async update(source: string, dto: UpdateParserSettingsDto, userId?: string) {
    return this.repo.update(source, dto, userId);
  }

  async initializeDefaults(source: string) {
    return this.repo.initializeDefaults(source);
  }
}
