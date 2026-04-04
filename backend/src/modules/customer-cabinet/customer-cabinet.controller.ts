import { Controller, Get, Param, Patch, Query, UseGuards, Req, Headers } from '@nestjs/common';
import { CustomerCabinetService } from './customer-cabinet.service';
import { CustomerJwtGuard } from '../customer-auth/customer-jwt.guard';

/**
 * Customer Cabinet Controller
 * 
 * Client Process Center API
 * 
 * Routes:
 * - GET /:customerId/dashboard - головна сторінка кабінету
 * - GET /:customerId/requests - мої заявки (leads)
 * - GET /:customerId/orders - мої замовлення (deals)
 * - GET /:customerId/orders/:dealId - деталі замовлення
 * - GET /:customerId/deposits - мої депозити
 * - GET /:customerId/timeline - історія подій
 * - GET /:customerId/notifications - сповіщення
 * - GET /:customerId/profile - профіль
 * - GET /history-reports - звіти VIN користувача (NEW)
 */

/**
 * Cabinet Controller for /api/cabinet/* routes
 * Used by frontend for customer cabinet functionality
 */
@Controller('cabinet')
export class CabinetController {
  constructor(private readonly service: CustomerCabinetService) {}

  // ============ INVOICES ============
  @Get('invoices')
  async getInvoices(@Req() req: any, @Headers('x-customer-id') customerId?: string) {
    const id = req.user?.id || customerId;
    if (!id) {
      return { data: [], invoices: [], summary: { total: 0, paid: 0, pending: 0, totalAmount: 0 } };
    }
    return this.service.getInvoices(id);
  }

  @Get('invoices/:customerId')
  async getInvoicesById(@Param('customerId') customerId: string) {
    return this.service.getInvoices(customerId);
  }

  // ============ SHIPPING ============
  @Get('shipping')
  async getShipping(@Req() req: any, @Headers('x-customer-id') customerId?: string) {
    const id = req.user?.id || customerId;
    if (!id) {
      return { data: [] };
    }
    return this.service.getShipping(id);
  }

  @Get('shipping/:customerId')
  async getShippingById(@Param('customerId') customerId: string) {
    return this.service.getShipping(customerId);
  }
}

@Controller('cabinet')
export class CabinetHistoryController {
  constructor(private readonly service: CustomerCabinetService) {}

  // ============ HISTORY REPORTS ============
  @Get('history-reports')
  async getHistoryReports(@Req() req: any) {
    // Get user from session/token
    const userId = req.user?.id || req.headers['x-customer-id'];
    if (!userId) {
      return [];
    }
    return this.service.getHistoryReports(userId);
  }
}

@Controller('customer-cabinet')
export class CustomerCabinetController {
  constructor(private readonly service: CustomerCabinetService) {}

  // ============ DASHBOARD ============
  @Get(':customerId/dashboard')
  getDashboard(@Param('customerId') customerId: string) {
    return this.service.getDashboard(customerId);
  }

  // ============ MY REQUESTS ============
  @Get(':customerId/requests')
  getRequests(
    @Param('customerId') customerId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getRequests(customerId, {
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  // ============ MY ORDERS ============
  @Get(':customerId/orders')
  getOrders(
    @Param('customerId') customerId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getOrders(customerId, {
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get(':customerId/orders/:dealId')
  getOrderDetails(
    @Param('customerId') customerId: string,
    @Param('dealId') dealId: string,
  ) {
    return this.service.getOrderDetails(customerId, dealId);
  }

  // ============ MY DEPOSITS ============
  @Get(':customerId/deposits')
  getDeposits(
    @Param('customerId') customerId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getDeposits(customerId, {
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  // ============ NOTIFICATIONS ============
  @Get(':customerId/notifications')
  getNotifications(
    @Param('customerId') customerId: string,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getNotifications(customerId, {
      unreadOnly: unread === 'true',
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Patch(':customerId/notifications/:notificationId/read')
  markNotificationAsRead(
    @Param('customerId') customerId: string,
    @Param('notificationId') notificationId: string,
  ) {
    return this.service.markNotificationAsRead(customerId, notificationId);
  }

  // ============ TIMELINE ============
  @Get(':customerId/timeline')
  getTimeline(
    @Param('customerId') customerId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return this.service.getTimeline(customerId, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      type,
    });
  }

  // ============ PROFILE ============
  @Get(':customerId/profile')
  getProfile(@Param('customerId') customerId: string) {
    return this.service.getProfile(customerId);
  }

  // ============ CARFAX REPORTS ============
  @Get(':customerId/carfax')
  getCarfaxReports(@Param('customerId') customerId: string) {
    return this.service.getCarfaxReports(customerId);
  }

  // ============ CONTRACTS ============
  @Get(':customerId/contracts')
  getContracts(@Param('customerId') customerId: string) {
    return this.service.getContracts(customerId);
  }

  // ============ INVOICES ============
  @Get(':customerId/invoices')
  getInvoices(@Param('customerId') customerId: string) {
    return this.service.getInvoices(customerId);
  }

  // ============ SHIPPING ============
  @Get(':customerId/shipping')
  getShipping(@Param('customerId') customerId: string) {
    return this.service.getShipping(customerId);
  }
}
