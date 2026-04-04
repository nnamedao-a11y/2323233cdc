/**
 * BIBI Cars - Routing Event Handler
 * Auto-routes leads when created
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnSystemEvent } from '../../common/events/on-event.decorator';
import { SystemEvent, EventTypes } from '../../common/events/system-event.interface';
import { RoutingService } from './routing.service';

@Injectable()
export class RoutingHandler {
  private readonly logger = new Logger(RoutingHandler.name);

  constructor(private readonly routingService: RoutingService) {}

  @OnSystemEvent(EventTypes.LEAD_CREATED)
  async handleLeadCreated(event: SystemEvent) {
    // Skip if already assigned
    if (event.payload.assignedTo || event.payload.managerId) {
      this.logger.log(`Lead ${event.aggregateId} already assigned, skipping routing`);
      return;
    }

    this.logger.log(`Auto-routing lead ${event.aggregateId}`);

    try {
      await this.routingService.routeLead(event.payload);
    } catch (err) {
      this.logger.error(`Failed to route lead ${event.aggregateId}`, err);
    }
  }

  @OnSystemEvent(EventTypes.ROUTING_REASSIGNMENT_REQUIRED)
  async handleReassignmentRequired(event: SystemEvent) {
    this.logger.log(`Reassignment required for lead ${event.payload.leadId}`);
  }

  @OnSystemEvent(EventTypes.ROUTING_FALLBACK_QUEUE)
  async handleFallbackQueue(event: SystemEvent) {
    this.logger.log(
      `Lead ${event.payload.leadId} sent to queue ${event.payload.queueName}: ${event.payload.reason}`
    );
  }
}
