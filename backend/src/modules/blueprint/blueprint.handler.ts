/**
 * BIBI Cars - Blueprint Event Handler
 * Listens to blueprint events for analytics/journey
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnSystemEvent } from '../../common/events/on-event.decorator';
import { SystemEvent, EventTypes } from '../../common/events/system-event.interface';

@Injectable()
export class BlueprintHandler {
  private readonly logger = new Logger(BlueprintHandler.name);

  @OnSystemEvent(EventTypes.DEAL_STAGE_CHANGED)
  async handleStageChanged(event: SystemEvent) {
    this.logger.log(
      `📊 Blueprint: Deal ${event.aggregateId} moved ${event.payload.from} → ${event.payload.to}`,
    );

    // Here you would:
    // - Update analytics counters
    // - Update funnel metrics
    // - Track stage duration
  }

  @OnSystemEvent(EventTypes.DEAL_STAGE_BLOCKED)
  async handleStageBlocked(event: SystemEvent) {
    this.logger.warn(
      `🚫 Blueprint BLOCKED: Deal ${event.aggregateId} cannot move ${event.payload.from} → ${event.payload.to}`,
    );
    this.logger.warn(`   Reason: ${event.payload.reason}`);

    // Here you would:
    // - Track blocked attempts
    // - Analyze common blockers
  }

  @OnSystemEvent(EventTypes.DEAL_CLOSED_WON)
  async handleDealWon(event: SystemEvent) {
    this.logger.log(`🎉 DEAL WON: ${event.aggregateId}`);

    // Here you would:
    // - Update manager KPI
    // - Update revenue metrics
    // - Trigger success notifications
  }

  @OnSystemEvent(EventTypes.DEAL_CLOSED_LOST)
  async handleDealLost(event: SystemEvent) {
    this.logger.log(`❌ DEAL LOST: ${event.aggregateId} from stage ${event.payload.from}`);

    // Here you would:
    // - Track loss reasons
    // - Analyze at which stage deals are lost
    // - Notify team lead
  }
}
