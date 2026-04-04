import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AiEnrichmentService } from './ai-enrichment.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiEnrichmentService) {}

  @Get('health')
  async checkHealth() {
    const isHealthy = await this.aiService.isServiceHealthy();
    return { 
      status: isHealthy ? 'healthy' : 'unavailable',
      service: 'ai-enrichment'
    };
  }

  @Post('enrich/:listingId')
  async enrichListing(@Param('listingId') listingId: string) {
    const result = await this.aiService.enrichListing(listingId);
    return result 
      ? { success: true, listing: result }
      : { success: false, error: 'Failed to enrich listing' };
  }

  @Post('enrich-batch')
  async enrichBatch(@Query('limit') limit = '5') {
    const count = await this.aiService.enrichPublishedListings(parseInt(limit));
    return { success: true, enrichedCount: count };
  }
}
