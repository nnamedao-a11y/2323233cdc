/**
 * Payments Controller
 * 
 * API endpoints for invoice and payment management
 */

import { Controller, Get, Post, Patch, Param, Body, Req, UseGuards, Query, RawBodyRequest, Headers } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService, CreateInvoiceDto, CreateCheckoutDto } from './payments.service';
import { InvoiceStatus, InvoiceType } from './invoice.schema';
import { Request } from 'express';

// === PAYMENTS CONTROLLER (for /api/payments endpoints) ===
@Controller('payments')
export class PaymentsPackagesController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Get available payment packages
   * GET /api/payments/packages
   */
  @Get('packages')
  async getPackages() {
    return [
      { id: 'deposit_500', description: 'Deposit $500', amount: 500 },
      { id: 'deposit_1000', description: 'Deposit $1000', amount: 1000 },
      { id: 'deposit_2000', description: 'Deposit $2000', amount: 2000 },
    ];
  }
}

@Controller('invoices')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // === ROOT GET (for query params) ===
  
  /**
   * Get invoices with filters
   * GET /api/invoices?managerId=...&status=...
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getInvoices(
    @Query('managerId') managerId?: string,
    @Query('status') status?: InvoiceStatus,
    @Query('type') type?: InvoiceType,
  ) {
    if (managerId) {
      return this.paymentsService.getManagerInvoices(managerId, status);
    }
    return this.paymentsService.getAdminInvoices({ status, type });
  }

  // === STATIC ROUTES FIRST (before parameterized) ===

  /**
   * Get admin invoices (alias)
   * GET /api/invoices/admin
   */
  @Get('admin')
  @UseGuards(JwtAuthGuard)
  async getAdminInvoicesShort(
    @Query('status') status?: InvoiceStatus,
    @Query('type') type?: InvoiceType,
  ) {
    return this.paymentsService.getAdminInvoices({ status, type });
  }

  /**
   * Get current user's invoices
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyInvoices(@Req() req: any) {
    return this.paymentsService.getUserInvoices(req.user.id);
  }

  /**
   * Get all invoices (admin)
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard)
  async getAdminInvoices(
    @Query('status') status?: InvoiceStatus,
    @Query('type') type?: InvoiceType,
  ) {
    return this.paymentsService.getAdminInvoices({ status, type });
  }

  /**
   * Get overdue invoices
   */
  @Get('admin/overdue')
  @UseGuards(JwtAuthGuard)
  async getOverdueInvoices() {
    return this.paymentsService.getOverdueInvoices();
  }

  /**
   * Get analytics (admin)
   */
  @Get('admin/analytics')
  @UseGuards(JwtAuthGuard)
  async getAnalytics(@Query('days') days?: number) {
    return this.paymentsService.getAnalytics(days || 30);
  }

  /**
   * Get analytics (alias without admin prefix)
   */
  @Get('analytics')
  @UseGuards(JwtAuthGuard)
  async getAnalyticsPublic(@Query('days') days?: number) {
    return this.paymentsService.getAnalytics(days || 30);
  }

  /**
   * Get manager's invoices
   */
  @Get('manager/my')
  @UseGuards(JwtAuthGuard)
  async getManagerInvoices(@Req() req: any) {
    return this.paymentsService.getManagerInvoices(req.user.id);
  }

  /**
   * Get invoices for a deal
   */
  @Get('deal/:dealId')
  @UseGuards(JwtAuthGuard)
  async getDealInvoices(@Param('dealId') dealId: string) {
    return this.paymentsService.getDealInvoices(dealId);
  }

  /**
   * Get checkout session status
   */
  @Get('checkout/:sessionId/status')
  @UseGuards(JwtAuthGuard)
  async getCheckoutStatus(@Param('sessionId') sessionId: string) {
    return this.paymentsService.getCheckoutStatus(sessionId);
  }

  // === PARAMETERIZED ROUTES LAST ===

  /**
   * Get invoice by ID
   */
  @Get(':invoiceId')
  @UseGuards(JwtAuthGuard)
  async getInvoice(@Param('invoiceId') invoiceId: string) {
    return this.paymentsService.getInvoice(invoiceId);
  }

  // === CREATE/UPDATE ENDPOINTS ===

  /**
   * Create a new invoice
   */
  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: any) {
    if (!dto.managerId) {
      dto.managerId = req.user.id;
    }
    return this.paymentsService.createInvoice(dto);
  }

  /**
   * Create Stripe checkout session
   */
  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(@Body() dto: CreateCheckoutDto) {
    return this.paymentsService.createCheckoutSession(dto);
  }

  /**
   * Send invoice (change status to sent)
   */
  @Patch(':invoiceId/send')
  @UseGuards(JwtAuthGuard)
  async sendInvoice(@Param('invoiceId') invoiceId: string) {
    return this.paymentsService.sendInvoice(invoiceId);
  }

  /**
   * Cancel invoice
   */
  @Patch(':invoiceId/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelInvoice(@Param('invoiceId') invoiceId: string) {
    return this.paymentsService.cancelInvoice(invoiceId);
  }

  /**
   * Mark invoice as paid manually
   */
  @Patch(':invoiceId/mark-paid')
  @UseGuards(JwtAuthGuard)
  async markAsPaid(@Param('invoiceId') invoiceId: string, @Req() req: any) {
    return this.paymentsService.markAsPaid(invoiceId, req.user.id);
  }

  // === WEBHOOK ENDPOINT (no auth) ===

  /**
   * Stripe webhook handler
   */
  @Post('webhook/stripe')
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.paymentsService.handleWebhook(req.rawBody!, signature);
  }
}
