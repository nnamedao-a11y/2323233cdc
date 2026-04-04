/**
 * BIBI Cars - Routing Cron
 * Processes stale leads for reassignment
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RoutingService } from './routing.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { EventTypes } from '../../common/events/system-event.interface';

@Injectable()
export class RoutingCron {
  private readonly logger = new Logger(RoutingCron.name);

  constructor(
    private readonly routingService: RoutingService,
    private readonly eventBus: EventBusService,
  ) {}

  // Run every 10 minutes
  @Cron('*/10 * * * *')
  async processStaleLeads() {
    this.logger.log('Processing stale leads for reassignment...');

    try {
      const staleLeads = await this.routingService.getStaleLeads(30);

      this.logger.log(`Found ${staleLeads.length} stale leads`);

      for (const lead of staleLeads) {
        await this.eventBus.emit({
          type: EventTypes.ROUTING_REASSIGNMENT_REQUIRED,
          aggregateType: 'lead',
          aggregateId: lead.id,
          payload: {
            leadId: lead.id,
            managerId: lead.assignedTo,
            staleMinutes: 30,
          },
          actorType: 'system',
          source: 'cron',
        });

        await this.routingService.reassignStaleLead(lead);
      }
    } catch (err) {
      this.logger.error('Failed to process stale leads', err);
    }
  }
}
