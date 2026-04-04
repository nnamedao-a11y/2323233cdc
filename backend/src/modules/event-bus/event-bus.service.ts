/**
 * BIBI Cars - Event Bus Service
 * Central event dispatcher with handler discovery
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemEventDocument } from './schemas/system-event.schema';
import { EVENT_HANDLER_METADATA } from '../../common/events/on-event.decorator';
import { SystemEvent } from '../../common/events/system-event.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EventBusService implements OnModuleInit {
  private readonly logger = new Logger(EventBusService.name);
  private handlers = new Map<string, Function[]>();
  private initialized = false;

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    @InjectModel(SystemEventDocument.name)
    private readonly eventModel: Model<SystemEventDocument>,
  ) {}

  onModuleInit() {
    this.registerHandlers();
    this.initialized = true;
  }

  private registerHandlers() {
    const providers = this.discoveryService.getProviders();
    let handlerCount = 0;

    providers.forEach((wrapper) => {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== 'object') return;

      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) return;

      this.metadataScanner.scanFromPrototype(
        instance,
        prototype,
        (methodName: string) => {
          const methodRef = instance[methodName];
          if (typeof methodRef !== 'function') return;

          const eventType = Reflect.getMetadata(EVENT_HANDLER_METADATA, methodRef);

          if (eventType) {
            if (!this.handlers.has(eventType)) {
              this.handlers.set(eventType, []);
            }

            this.handlers.get(eventType)?.push(methodRef.bind(instance));
            handlerCount++;
          }
        },
      );
    });

    this.logger.log(`✓ Event Bus: ${handlerCount} handlers registered for ${this.handlers.size} event types`);
  }

  /**
   * Emit a system event
   * - Persists to DB
   * - Executes all registered handlers
   */
  async emit(event: Partial<SystemEvent>): Promise<SystemEvent> {
    const fullEvent: SystemEvent = {
      id: uuidv4(),
      createdAt: new Date(),
      type: event.type || 'unknown',
      aggregateType: event.aggregateType || 'unknown',
      aggregateId: event.aggregateId || '',
      payload: event.payload || {},
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
    } as SystemEvent;

    // 1. Save event to DB (async, don't block)
    try {
      await this.eventModel.create({
        ...fullEvent,
        eventDate: fullEvent.createdAt,
      });
    } catch (err) {
      this.logger.error(`Failed to persist event ${fullEvent.type}`, err);
    }

    // 2. Execute handlers
    const handlers = this.handlers.get(fullEvent.type) || [];

    if (handlers.length > 0) {
      const results = await Promise.allSettled(
        handlers.map(async (handler) => {
          try {
            await handler(fullEvent);
          } catch (err) {
            this.logger.error(`Handler error for ${fullEvent.type}`, err);
            throw err;
          }
        }),
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        this.logger.warn(`Event ${fullEvent.type}: ${failed}/${handlers.length} handlers failed`);
      }
    }

    return fullEvent;
  }

  /**
   * Emit multiple events
   */
  async emitBatch(events: Partial<SystemEvent>[]): Promise<SystemEvent[]> {
    return Promise.all(events.map((e) => this.emit(e)));
  }

  /**
   * Query events for analytics/journey
   */
  async getEvents(filter: {
    type?: string;
    aggregateType?: string;
    aggregateId?: string;
    actorId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    const query: any = {};

    if (filter.type) query.type = filter.type;
    if (filter.aggregateType) query.aggregateType = filter.aggregateType;
    if (filter.aggregateId) query.aggregateId = filter.aggregateId;
    if (filter.actorId) query.actorId = filter.actorId;

    if (filter.fromDate || filter.toDate) {
      query.eventDate = {};
      if (filter.fromDate) query.eventDate.$gte = filter.fromDate;
      if (filter.toDate) query.eventDate.$lte = filter.toDate;
    }

    return this.eventModel
      .find(query)
      .sort({ eventDate: -1 })
      .limit(filter.limit || 100)
      .lean();
  }

  /**
   * Get journey events for an entity
   */
  async getJourney(aggregateType: string, aggregateId: string): Promise<any[]> {
    return this.eventModel
      .find({ aggregateType, aggregateId })
      .sort({ eventDate: 1 })
      .lean();
  }

  /**
   * Get event stats
   */
  async getStats(fromDate?: Date): Promise<Record<string, number>> {
    const match: any = {};
    if (fromDate) {
      match.eventDate = { $gte: fromDate };
    }

    const result = await this.eventModel.aggregate([
      { $match: match },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);

    return result.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
  }
}
