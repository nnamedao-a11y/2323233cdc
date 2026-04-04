import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  async create(@Body() data: any, @Request() req) {
    return this.notesService.create(data, req.user.id);
  }

  @Get()
  async findByEntity(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.notesService.findByEntity(entityType, entityId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.notesService.delete(id);
  }
}
