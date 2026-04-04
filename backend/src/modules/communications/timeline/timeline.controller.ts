import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * Timeline Controller - API для перегляду історії комунікацій
 */
@Controller('communications/timeline')
@UseGuards(JwtAuthGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  /**
   * Отримати timeline для ліда
   * GET /api/communications/timeline/lead/:leadId
   */
  @Get('lead/:leadId')
  async getLeadTimeline(
    @Param('leadId') leadId: string,
    @Query('limit') limit?: number
  ) {
    return this.timelineService.getTimeline(leadId, 'lead', limit || 50);
  }

  /**
   * Отримати timeline для клієнта
   * GET /api/communications/timeline/customer/:customerId
   */
  @Get('customer/:customerId')
  async getCustomerTimeline(
    @Param('customerId') customerId: string,
    @Query('limit') limit?: number
  ) {
    return this.timelineService.getTimeline(customerId, 'customer', limit || 50);
  }

  /**
   * Отримати статистику комунікацій для ліда
   * GET /api/communications/timeline/lead/:leadId/stats
   */
  @Get('lead/:leadId/stats')
  async getLeadStats(@Param('leadId') leadId: string) {
    return this.timelineService.getStats(leadId);
  }
}
