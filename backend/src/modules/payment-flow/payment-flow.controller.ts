/**
 * Payment Flow Controller
 * 
 * API endpoints for payment flow management
 */

import { Controller, Get, Post, Param, Body, Req, UseGuards, Patch } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentFlowService } from './payment-flow.service';
import { DealStep } from './payment-flow.schema';

@Controller('payment-flow')
export class PaymentFlowController {
  constructor(private readonly paymentFlowService: PaymentFlowService) {}

  // === STATIC ROUTES FIRST ===

  /**
   * Get user's flow summary
   */
  @Get('user/me')
  @UseGuards(JwtAuthGuard)
  async getMyFlowSummary(@Req() req: any) {
    return this.paymentFlowService.getUserFlowSummary(req.user.id);
  }

  /**
   * Get all blocked deals (admin) - alias without /admin prefix
   */
  @Get('blocked')
  @UseGuards(JwtAuthGuard)
  async getBlockedDealsAlias() {
    return this.paymentFlowService.getBlockedDeals();
  }

  /**
   * Get all blocked deals (admin)
   */
  @Get('admin/blocked')
  @UseGuards(JwtAuthGuard)
  async getBlockedDeals() {
    return this.paymentFlowService.getBlockedDeals();
  }

  // === PARAMETERIZED ROUTES ===

  /**
   * Get payment flow state for a deal
   */
  @Get(':dealId')
  @UseGuards(JwtAuthGuard)
  async getFlowState(@Param('dealId') dealId: string) {
    return this.paymentFlowService.getFlowStateOrThrow(dealId);
  }

  /**
   * Check if invoice can be created for a deal
   */
  @Get(':dealId/can-create-invoice')
  @UseGuards(JwtAuthGuard)
  async canCreateInvoice(@Param('dealId') dealId: string) {
    return this.paymentFlowService.canCreateInvoice(dealId);
  }

  /**
   * Check if shipment status change is allowed
   */
  @Get(':dealId/can-change-status/:newStatus')
  @UseGuards(JwtAuthGuard)
  async canChangeShipmentStatus(
    @Param('dealId') dealId: string,
    @Param('newStatus') newStatus: DealStep,
  ) {
    return this.paymentFlowService.canChangeShipmentStatus(dealId, newStatus);
  }

  /**
   * Check if tracking is active for a deal
   */
  @Get(':dealId/tracking-active')
  @UseGuards(JwtAuthGuard)
  async isTrackingActive(@Param('dealId') dealId: string) {
    const isActive = await this.paymentFlowService.isTrackingActive(dealId);
    return { dealId, trackingActive: isActive };
  }

  /**
   * Create flow state for a deal
   */
  @Post(':dealId/init')
  @UseGuards(JwtAuthGuard)
  async initFlowState(
    @Param('dealId') dealId: string,
    @Body() body: { userId: string; managerId?: string },
    @Req() req: any,
  ) {
    return this.paymentFlowService.createFlowState({
      dealId,
      userId: body.userId,
      managerId: body.managerId || req.user.id,
    });
  }

  /**
   * Mark contract as signed
   */
  @Patch(':dealId/contract-signed')
  @UseGuards(JwtAuthGuard)
  async markContractSigned(@Param('dealId') dealId: string) {
    return this.paymentFlowService.markContractSigned(dealId);
  }
}
