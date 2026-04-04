import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PublishingService } from './publishing.service';
import { ListingStatus, ListingSource } from './schemas/vehicle-listing.schema';

/**
 * Publishing Controller
 * 
 * Admin API for vehicle listing moderation and publishing
 */

@Controller('publishing')
export class PublishingController {
  constructor(private readonly service: PublishingService) {}

  // ============ INGESTION ============
  
  @Post('ingest')
  ingest(@Body() body: {
    vin: string;
    source: ListingSource;
    sourceId?: string;
    sourceUrl?: string;
    rawData: Record<string, any>;
  }) {
    return this.service.ingestFromParser(body);
  }

  // ============ NORMALIZE ============
  
  @Patch(':id/normalize')
  normalize(
    @Param('id') id: string,
    @Body() body: {
      make?: string;
      model?: string;
      year?: number;
      trim?: string;
      engineType?: string;
      transmission?: string;
      driveType?: string;
      fuelType?: string;
      bodyType?: string;
      color?: string;
      interiorColor?: string;
      mileage?: number;
      damageType?: string;
      primaryDamage?: string;
      secondaryDamage?: string;
      titleStatus?: string;
      hasKeys?: boolean;
      isRunnable?: boolean;
      estimatedRetail?: number;
      estimatedRepairCost?: number;
      currentBid?: number;
      buyNowPrice?: number;
      auctionDate?: Date;
      auctionLocation?: string;
      lotNumber?: string;
      images?: string[];
      primaryImage?: string;
      userId?: string;
    },
  ) {
    const { userId, ...data } = body;
    return this.service.normalize(id, data, userId);
  }

  // ============ MODERATION WORKFLOW ============
  
  @Post(':id/submit-review')
  submitForReview(
    @Param('id') id: string,
    @Body('userId') userId?: string,
  ) {
    return this.service.submitForReview(id, userId);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: { userId: string; notes?: string },
  ) {
    return this.service.approve(id, body.userId, body.notes);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { userId: string; reason: string },
  ) {
    return this.service.reject(id, body.userId, body.reason);
  }

  // ============ PUBLISHING ============
  
  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    return this.service.publish(id, userId);
  }

  @Post(':id/unpublish')
  unpublish(
    @Param('id') id: string,
    @Body() body: { userId: string; reason?: string },
  ) {
    return this.service.unpublish(id, body.userId, body.reason);
  }

  @Post(':id/archive')
  archive(
    @Param('id') id: string,
    @Body() body: { userId: string; reason?: string },
  ) {
    return this.service.archive(id, body.userId, body.reason);
  }

  // ============ BULK OPERATIONS ============
  
  @Post('bulk/approve')
  bulkApprove(@Body() body: { ids: string[]; userId: string }) {
    return this.service.bulkApprove(body.ids, body.userId);
  }

  @Post('bulk/publish')
  bulkPublish(@Body() body: { ids: string[]; userId: string }) {
    return this.service.bulkPublish(body.ids, body.userId);
  }

  // ============ QUERIES ============
  
  @Get('queue')
  getModerationQueue(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ListingStatus,
  ) {
    return this.service.getModerationQueue({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      status,
    });
  }

  @Get('published')
  getPublished(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('make') make?: string,
    @Query('model') model?: string,
    @Query('year') year?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.service.getPublished({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      make,
      model,
      year: year ? parseInt(year) : undefined,
      minPrice: minPrice ? parseInt(minPrice) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice) : undefined,
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Get('vin/:vin')
  getByVin(@Param('vin') vin: string) {
    return this.service.findByVin(vin);
  }

  // ============ UPDATE ============
  
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const { userId, ...data } = body;
    return this.service.update(id, data, userId);
  }

  // ============ DELETE ============
  
  @Delete(':id')
  delete(
    @Param('id') id: string,
    @Body('userId') userId?: string,
  ) {
    return this.service.delete(id, userId);
  }

  // ============ TRACKING ============
  
  @Post(':id/view')
  incrementView(@Param('id') id: string) {
    return this.service.incrementViewCount(id);
  }

  // ============ PUBLIC API ============
  
  @Get('public/listings')
  getPublicListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('make') make?: string,
    @Query('model') model?: string,
    @Query('year') year?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('auction') auction?: string,
    @Query('featured') featured?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.service.getPublicListings({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      make,
      model,
      year: year ? parseInt(year) : undefined,
      minPrice: minPrice ? parseInt(minPrice) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice) : undefined,
      auction: auction === 'true',
      featured: featured === 'true',
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get('public/listings/:slug')
  getPublicBySlug(@Param('slug') slug: string) {
    return this.service.getPublicBySlug(slug);
  }
}
