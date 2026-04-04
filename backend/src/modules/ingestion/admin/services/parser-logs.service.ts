/**
 * Parser Logs Service
 */

import { Injectable } from '@nestjs/common';
import { ParserLogRepository, LogQuery, CreateLogDto } from '../repositories/parser-log.repository';
import { ParserLogLevel, ParserLogEvent } from '../enums/parser-status.enum';
import { ParserLog } from '../schemas/parser-log.schema';

@Injectable()
export class ParserLogsService {
  constructor(private readonly repo: ParserLogRepository) {}

  async info(
    source: string, 
    event: string, 
    message?: string, 
    meta?: Record<string, any>,
  ): Promise<ParserLog> {
    return this.repo.create({ 
      source, 
      level: ParserLogLevel.INFO, 
      event, 
      message, 
      meta,
    });
  }

  async warn(
    source: string, 
    event: string, 
    message?: string, 
    meta?: Record<string, any>,
  ): Promise<ParserLog> {
    return this.repo.create({ 
      source, 
      level: ParserLogLevel.WARN, 
      event, 
      message, 
      meta,
    });
  }

  async error(
    source: string, 
    event: string, 
    message?: string, 
    meta?: Record<string, any>,
  ): Promise<ParserLog> {
    return this.repo.create({ 
      source, 
      level: ParserLogLevel.ERROR, 
      event, 
      message, 
      meta,
    });
  }

  async logRunStart(source: string, triggeredBy?: string): Promise<void> {
    await this.info(source, ParserLogEvent.RUN_STARTED, 'Parser run started', {
      triggeredBy,
      timestamp: new Date().toISOString(),
    });
  }

  async logRunFinished(
    source: string, 
    stats: { 
      itemsParsed: number; 
      itemsCreated: number; 
      itemsUpdated: number; 
      durationMs: number;
    },
  ): Promise<void> {
    await this.info(source, ParserLogEvent.RUN_FINISHED, 'Parser run finished', {
      ...stats,
      timestamp: new Date().toISOString(),
    });
  }

  async logRunFailed(
    source: string, 
    error: string, 
    meta?: Record<string, any>,
  ): Promise<void> {
    await this.error(source, ParserLogEvent.RUN_FAILED, error, {
      ...meta,
      timestamp: new Date().toISOString(),
    });
  }

  async logProxySwitched(
    source: string, 
    fromProxy?: string, 
    toProxy?: string,
  ): Promise<void> {
    await this.warn(source, ParserLogEvent.PROXY_SWITCHED, 'Proxy switched', {
      fromProxy,
      toProxy,
      timestamp: new Date().toISOString(),
    });
  }

  async findAll(query: LogQuery) {
    return this.repo.findAll(query);
  }

  async findBySource(source: string, limit?: number) {
    return this.repo.findBySource(source, limit);
  }

  async findErrors(source?: string, limit?: number) {
    return this.repo.findErrors(source, limit);
  }

  async getStats(source?: string) {
    return this.repo.countByLevelLastHour(source);
  }
}
