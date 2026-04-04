import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('deposits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.OWNER)
  async create(@Body() data: any, @Request() req) {
    return this.depositsService.create(data, req.user.id);
  }

  @Get()
  async findAll(@Query() query: any) {
    return this.depositsService.findAll(query);
  }

  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.OWNER)
  async getStats() {
    return this.depositsService.getStats();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.depositsService.findById(id);
  }

  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.OWNER)
  async update(@Param('id') id: string, @Body() data: any) {
    return this.depositsService.update(id, data);
  }

  @Put(':id/approve')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.OWNER)
  async approve(@Param('id') id: string, @Request() req) {
    return this.depositsService.approve(id, req.user.id);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async delete(@Param('id') id: string) {
    return this.depositsService.delete(id);
  }
}
