import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async create(@Body() data: any, @Request() req) {
    return this.tasksService.create(data, req.user.id);
  }

  @Get()
  async findAll(@Query() query: any) {
    return this.tasksService.findAll(query);
  }

  @Get('my')
  async getMyTasks(@Request() req, @Query() query: any) {
    return this.tasksService.findAll({ ...query, assignedTo: req.user.id });
  }

  // === 1 ACTIVE TASK ENDPOINTS ===
  
  @Get('queue')
  async getMyQueue(@Request() req) {
    return this.tasksService.getManagerQueue(req.user.id);
  }

  @Get('active')
  async getActiveTask(@Request() req) {
    return this.tasksService.getActiveTask(req.user.id);
  }

  @Post(':id/start')
  async startTask(@Param('id') id: string, @Request() req) {
    return this.tasksService.startTask(id, req.user.id, req.user.role, req.user.name);
  }

  @Post(':id/complete')
  async completeTask(@Param('id') id: string, @Request() req) {
    return this.tasksService.completeTask(id, req.user.id, req.user.role, req.user.name);
  }

  @Get('overdue')
  async getOverdue() {
    return this.tasksService.getOverdue();
  }

  @Get('stats')
  async getStats(@Request() req) {
    return this.tasksService.getStats(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.tasksService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.tasksService.delete(id);
  }
}
