/**
 * Shipping Tracking Controller
 * 
 * Manager endpoints for tracking management
 * Cabinet endpoints for customer visibility
 */

import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Param, 
  Body, 
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ShippingTrackingService } from './shipping-tracking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

/**
 * Manager Shipping Tracking Controller
 * For managers to add/update tracking info and enable auto-sync
 */
@Controller('manager/shipping')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagerShippingTrackingController {
  constructor(private readonly trackingService: ShippingTrackingService) {}

  /**
   * Update tracking fields (container, B/L, booking, carrier)
   */
  @Patch(':shipmentId/tracking')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.MANAGER)
  async updateTracking(
    @Param('shipmentId') shipmentId: string,
    @Body() dto: {
      containerNumber?: string;
      billOfLading?: string;
      bookingNumber?: string;
      carrier?: string;
      vesselName?: string;
      originPort?: string;
      destinationPort?: string;
    },
  ) {
    return this.trackingService.updateTrackingFields(shipmentId, dto);
  }

  /**
   * Enable auto-tracking for shipment
   */
  @Post(':shipmentId/enable')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.MANAGER)
  async enableTracking(@Param('shipmentId') shipmentId: string) {
    return this.trackingService.enableTracking(shipmentId);
  }

  /**
   * Disable auto-tracking for shipment
   */
  @Post(':shipmentId/disable')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.MANAGER)
  async disableTracking(@Param('shipmentId') shipmentId: string) {
    return this.trackingService.disableTracking(shipmentId);
  }

  /**
   * Force sync for a shipment
   */
  @Post(':shipmentId/sync')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.MANAGER)
  async syncShipment(@Param('shipmentId') shipmentId: string) {
    await this.trackingService.syncShipment(shipmentId);
    return { success: true, message: 'Sync initiated' };
  }

  /**
   * Get shipments missing tracking data
   */
  @Get('missing-tracking')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.MANAGER)
  async getMissingTracking(@Query('hours') hours?: string) {
    const hoursNum = hours ? parseInt(hours, 10) : 24;
    return this.trackingService.getShipmentsWithoutTracking(hoursNum);
  }

  /**
   * Get tracking statistics
   */
  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getStats() {
    return this.trackingService.getTrackingStats();
  }
}

/**
 * Admin Shipping Dashboard Controller
 * For owner/team lead to monitor all tracking
 */
@Controller('admin/shipping')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminShippingTrackingController {
  constructor(private readonly trackingService: ShippingTrackingService) {}

  /**
   * Get tracking statistics
   */
  @Get('tracking-stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getTrackingStats() {
    return this.trackingService.getTrackingStats();
  }

  /**
   * Get all shipments without tracking
   */
  @Get('missing-tracking')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getMissingTracking(@Query('hours') hours?: string) {
    const hoursNum = hours ? parseInt(hours, 10) : 24;
    return this.trackingService.getShipmentsWithoutTracking(hoursNum);
  }

  /**
   * Force sync all active shipments
   */
  @Post('sync-all')
  @Roles(UserRole.OWNER)
  async syncAll() {
    await this.trackingService.syncAllShipments();
    return { success: true, message: 'Sync all initiated' };
  }
}
