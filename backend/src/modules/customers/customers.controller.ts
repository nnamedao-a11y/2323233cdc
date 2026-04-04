import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomerTimelineService } from './customer-timeline.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

/**
 * Customers Controller v2.0 - Customer 360
 * 
 * Endpoints:
 * POST /customers - Create customer
 * GET /customers - List customers
 * GET /customers/stats - Get statistics
 * GET /customers/:id - Get customer by ID
 * GET /customers/:id/360 - Get full 360 view (leads, quotes, deals)
 * GET /customers/:id/timeline - Get timeline events
 * PATCH /customers/:id/refresh-stats - Refresh aggregated stats
 * PUT /customers/:id - Update customer
 * DELETE /customers/:id - Delete customer
 */

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly timelineService: CustomerTimelineService,
  ) {}

  @Post()
  async create(@Body() data: any, @Request() req) {
    const customer = await this.customersService.create(data, req.user.id);
    
    // Add timeline event
    await this.timelineService.addEvent({
      customerId: customer.id,
      type: 'customer_created',
      title: 'Клієнта створено',
      entityType: 'customer',
      entityId: customer.id,
      managerId: req.user.id,
    });
    
    return customer;
  }

  @Get()
  async findAll(@Query() query: any) {
    return this.customersService.findAll(query);
  }

  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getStats() {
    return this.customersService.getStats();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Get(':id/360')
  async get360(@Param('id') id: string) {
    return this.customersService.get360(id);
  }

  @Get(':id/timeline')
  async getTimeline(@Param('id') id: string) {
    return this.timelineService.getByCustomerId(id);
  }

  @Patch(':id/refresh-stats')
  async refreshStats(@Param('id') id: string) {
    return this.customersService.refreshStats(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any, @Request() req) {
    const customer = await this.customersService.update(id, data);
    
    if (customer) {
      await this.timelineService.addEvent({
        customerId: id,
        type: 'customer_updated',
        title: 'Дані клієнта оновлено',
        entityType: 'customer',
        entityId: id,
        managerId: req.user.id,
      });
    }
    
    return customer;
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async delete(@Param('id') id: string) {
    return this.customersService.delete(id);
  }
}
