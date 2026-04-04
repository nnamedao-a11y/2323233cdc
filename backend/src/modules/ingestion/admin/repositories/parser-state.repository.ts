/**
 * Parser State Repository
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParserState } from '../schemas/parser-state.schema';
import { ParserStatus } from '../enums/parser-status.enum';

@Injectable()
export class ParserStateRepository {
  constructor(
    @InjectModel(ParserState.name) private model: Model<ParserState>,
  ) {}

  async findAll(): Promise<ParserState[]> {
    return this.model.find().sort({ source: 1 });
  }

  async findBySource(source: string): Promise<ParserState | null> {
    return this.model.findOne({ source });
  }

  async markRunning(source: string, userId?: string): Promise<ParserState> {
    return this.model.findOneAndUpdate(
      { source },
      {
        $set: {
          status: ParserStatus.RUNNING,
          lastRunAt: new Date(),
          isPaused: false,
          updatedBy: userId,
        },
      },
      { upsert: true, new: true },
    );
  }

  async markSuccess(
    source: string,
    stats: { 
      itemsParsed: number; 
      itemsCreated: number; 
      itemsUpdated: number; 
      lastDurationMs: number;
    },
  ): Promise<ParserState> {
    return this.model.findOneAndUpdate(
      { source },
      {
        $set: {
          status: ParserStatus.IDLE,
          lastSuccessAt: new Date(),
          lastDurationMs: stats.lastDurationMs,
          itemsParsed: stats.itemsParsed,
          itemsCreated: stats.itemsCreated,
          itemsUpdated: stats.itemsUpdated,
          consecutiveFailures: 0,
          isPaused: false,
        },
      },
      { upsert: true, new: true },
    );
  }

  async markFailure(
    source: string, 
    error: string, 
    extra?: { lastDurationMs?: number },
  ): Promise<ParserState> {
    return this.model.findOneAndUpdate(
      { source },
      {
        $set: {
          status: ParserStatus.ERROR,
          'healthSnapshot.lastError': error,
          lastDurationMs: extra?.lastDurationMs,
        },
        $inc: {
          errorsCount: 1,
          consecutiveFailures: 1,
        },
      },
      { upsert: true, new: true },
    );
  }

  async markIdle(source: string): Promise<ParserState | null> {
    return this.model.findOneAndUpdate(
      { source },
      { $set: { status: ParserStatus.IDLE } },
      { new: true },
    );
  }

  async markStopped(source: string, reason: string, userId?: string): Promise<ParserState | null> {
    return this.model.findOneAndUpdate(
      { source },
      {
        $set: {
          isPaused: true,
          status: ParserStatus.STOPPED,
          pauseReason: reason,
          updatedBy: userId,
        },
      },
      { new: true },
    );
  }

  async updateHealthSnapshot(
    source: string, 
    snapshot: ParserState['healthSnapshot'],
  ): Promise<void> {
    await this.model.updateOne(
      { source },
      { $set: { healthSnapshot: snapshot } },
      { upsert: true },
    );
  }

  async initializeSource(source: string, cronExpression?: string): Promise<ParserState> {
    const existing = await this.findBySource(source);
    if (existing) return existing;

    return this.model.create({
      source,
      status: ParserStatus.IDLE,
      cronExpression,
      itemsParsed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      errorsCount: 0,
      consecutiveFailures: 0,
      isPaused: false,
    });
  }
}
