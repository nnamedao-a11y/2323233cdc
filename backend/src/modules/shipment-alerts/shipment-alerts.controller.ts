/**
 * Shipment Alerts Controller
 */

import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ShipmentAlertsService } from './shipment-alerts.service';

@Controller('shipment-alerts')
export class ShipmentAlertsController {
  constructor(private readonly alertsService: ShipmentAlertsService) {}

  /**
   * Get stalled shipments
   */
  @Get('stalled')
  @UseGuards(JwtAuthGuard)
  async getStalledShipments() {
    return this.alertsService.getStalledShipments();
  }

  /**
   * Get delayed shipments
   */
  @Get('delayed')
  @UseGuards(JwtAuthGuard)
  async getDelayedShipments() {
    return this.alertsService.getDelayedShipments();
  }

  /**
   * Get alert summary
   */
  @Get('summary')
  @UseGuards(JwtAuthGuard)
  async getAlertSummary() {
    return this.alertsService.getAlertSummary();
  }

  /**
   * Force process alerts (admin only)
   */
  @Post('process')
  @UseGuards(JwtAuthGuard)
  async forceProcess() {
    return this.alertsService.forceProcessAlerts();
  }
}
