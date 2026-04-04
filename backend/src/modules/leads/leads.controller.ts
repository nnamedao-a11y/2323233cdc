import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadDto, LeadQueryDto } from './dto/lead.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  async create(@Body() createLeadDto: CreateLeadDto, @Request() req) {
    return this.leadsService.create(createLeadDto, req.user.id);
  }

  @Get()
  async findAll(@Query() query: LeadQueryDto) {
    return this.leadsService.findAll(query);
  }

  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.TEAM_LEAD)
  async getStats() {
    return this.leadsService.getStats();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.leadsService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateLeadDto: UpdateLeadDto, @Request() req) {
    return this.leadsService.update(id, updateLeadDto, req.user.id);
  }

  @Put(':id/assign')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD, UserRole.TEAM_LEAD)
  async assign(@Param('id') id: string, @Body('assignedTo') assignedTo: string, @Request() req) {
    return this.leadsService.assign(id, assignedTo, req.user.id);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async delete(@Param('id') id: string) {
    return this.leadsService.delete(id);
  }
}
