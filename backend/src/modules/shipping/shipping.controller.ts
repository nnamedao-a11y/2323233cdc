/**
 * Shipping Controller
 * 
 * API endpoints for shipment management
 */

import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ShippingService, CreateShipmentDto, UpdateShipmentDto, UpdateShipmentStatusDto, AddEventDto } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  // === STATIC ROUTES FIRST (before parameterized) ===

  /**
   * Get current user's shipments
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyShipments(@Req() req: any) {
    return this.shippingService.getUserShipments(req.user.id);
  }

  /**
   * Get all active shipments (admin)
   */
  @Get('admin/active')
  @UseGuards(JwtAuthGuard)
  async getActiveShipments() {
    return this.shippingService.getActiveShipments();
  }

  /**
   * Get delayed shipments (admin)
   */
  @Get('admin/delayed')
  @UseGuards(JwtAuthGuard)
  async getDelayedShipments() {
    return this.shippingService.getDelayedShipments();
  }

  /**
   * Get analytics
   */
  @Get('analytics')
  @UseGuards(JwtAuthGuard)
  async getAnalytics(@Query('days') days?: number) {
    return this.shippingService.getAnalytics(days || 30);
  }

  /**
   * Get manager's shipments
   */
  @Get('manager/my')
  @UseGuards(JwtAuthGuard)
  async getManagerShipments(@Req() req: any) {
    return this.shippingService.getManagerShipments(req.user.id);
  }

  /**
   * Get shipment by deal ID
   */
  @Get('deal/:dealId')
  @UseGuards(JwtAuthGuard)
  async getByDealId(@Param('dealId') dealId: string) {
    return this.shippingService.getByDealId(dealId);
  }

  /**
   * Get shipment by VIN
   */
  @Get('vin/:vin')
  @UseGuards(JwtAuthGuard)
  async getByVin(@Param('vin') vin: string) {
    return this.shippingService.getByVin(vin);
  }

  // === PARAMETERIZED ROUTES (must be last) ===

  /**
   * Get shipment events
   */
  @Get(':shipmentId/events')
  @UseGuards(JwtAuthGuard)
  async getEvents(@Param('shipmentId') shipmentId: string) {
    return this.shippingService.getEvents(shipmentId);
  }

  /**
   * Get shipment by ID
   */
  @Get(':shipmentId')
  @UseGuards(JwtAuthGuard)
  async getShipment(@Param('shipmentId') shipmentId: string) {
    return this.shippingService.getShipment(shipmentId);
  }

  // === CREATE/UPDATE ENDPOINTS ===

  /**
   * Create a new shipment
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createShipment(@Body() dto: CreateShipmentDto, @Req() req: any) {
    if (!dto.managerId) {
      dto.managerId = req.user.id;
    }
    return this.shippingService.createShipment(dto);
  }

  /**
   * Add shipment event
   */
  @Post(':shipmentId/events')
  @UseGuards(JwtAuthGuard)
  async addEvent(
    @Param('shipmentId') shipmentId: string,
    @Body() dto: AddEventDto,
    @Req() req: any,
  ) {
    return this.shippingService.addEvent(shipmentId, dto, req.user.id);
  }

  /**
   * Update shipment details
   */
  @Patch(':shipmentId')
  @UseGuards(JwtAuthGuard)
  async updateShipment(
    @Param('shipmentId') shipmentId: string,
    @Body() dto: UpdateShipmentDto,
  ) {
    return this.shippingService.updateShipment(shipmentId, dto);
  }

  /**
   * Update shipment status
   */
  @Patch(':shipmentId/status')
  @UseGuards(JwtAuthGuard)
  async updateShipmentStatus(
    @Param('shipmentId') shipmentId: string,
    @Body() dto: UpdateShipmentStatusDto,
    @Req() req: any,
  ) {
    return this.shippingService.updateShipmentStatus(shipmentId, dto, req.user.id);
  }

  /**
   * Update ETA
   */
  @Patch(':shipmentId/eta')
  @UseGuards(JwtAuthGuard)
  async updateEta(
    @Param('shipmentId') shipmentId: string,
    @Body() body: { eta: string },
    @Req() req: any,
  ) {
    return this.shippingService.updateEta(shipmentId, new Date(body.eta), req.user.id);
  }

  /**
   * Update container info
   */
  @Patch(':shipmentId/container')
  @UseGuards(JwtAuthGuard)
  async updateContainer(
    @Param('shipmentId') shipmentId: string,
    @Body() body: { containerNumber: string; vesselName?: string },
    @Req() req: any,
  ) {
    return this.shippingService.updateContainer(
      shipmentId, 
      body.containerNumber, 
      body.vesselName, 
      req.user.id
    );
  }

  /**
   * Update event
   */
  @Patch('events/:eventId')
  @UseGuards(JwtAuthGuard)
  async updateEvent(
    @Param('eventId') eventId: string,
    @Body() dto: Partial<AddEventDto>,
  ) {
    return this.shippingService.updateEvent(eventId, dto);
  }

  /**
   * Delete event
   */
  @Delete('events/:eventId')
  @UseGuards(JwtAuthGuard)
  async deleteEvent(@Param('eventId') eventId: string) {
    return this.shippingService.deleteEvent(eventId);
  }
}

// === ALIAS CONTROLLER for /api/shipments ===
@Controller('shipments')
export class ShipmentsAliasController {
  constructor(private readonly shippingService: ShippingService) {}

  /**
   * Get stalled shipments (no tracking update for 7+ days)
   * GET /api/shipments/stalled
   */
  @Get('stalled')
  @UseGuards(JwtAuthGuard)
  async getStalledShipments(@Query('days') days?: number) {
    return this.shippingService.getStalledShipments(days || 7);
  }

  /**
   * Get shipments with filters
   * GET /api/shipments?managerId=...
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getShipments(
    @Query('managerId') managerId?: string,
    @Query('status') status?: string,
  ) {
    if (managerId) {
      return this.shippingService.getManagerShipments(managerId);
    }
    return this.shippingService.getActiveShipments();
  }
}
