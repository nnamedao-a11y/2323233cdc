/**
 * Proxy Admin Controller
 * 
 * Endpoints для керування проксі
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { ProxyAdminService } from '../services/proxy-admin.service';
import { AddProxyDto, UpdateProxyDto } from '../dto/parser-admin.dto';
import { UserRole } from '../../../../shared/enums';

@Controller('ingestion/admin/proxies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class ProxyAdminController {
  constructor(private readonly proxyService: ProxyAdminService) {}

  /**
   * GET /api/ingestion/admin/proxies
   * 
   * Список всіх проксі
   */
  @Get()
  async getAll() {
    return this.proxyService.getAll();
  }

  /**
   * POST /api/ingestion/admin/proxies
   * 
   * Додати новий проксі
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(@Body() dto: AddProxyDto) {
    return this.proxyService.add(dto.server, dto.username, dto.password, dto.priority);
  }

  /**
   * PATCH /api/ingestion/admin/proxies/:id/priority
   * 
   * Змінити priority проксі
   */
  @Patch(':id/priority')
  async setPriority(
    @Param('id') id: string,
    @Body() body: { priority: number },
  ) {
    return this.proxyService.setPriority(parseInt(id), body.priority);
  }

  /**
   * POST /api/ingestion/admin/proxies/:id/enable
   * 
   * Увімкнути проксі
   */
  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  async enable(@Param('id') id: string) {
    return this.proxyService.enable(parseInt(id));
  }

  /**
   * POST /api/ingestion/admin/proxies/:id/disable
   * 
   * Вимкнути проксі
   */
  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  async disable(@Param('id') id: string) {
    return this.proxyService.disable(parseInt(id));
  }

  /**
   * DELETE /api/ingestion/admin/proxies/:id
   * 
   * Видалити проксі
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.proxyService.remove(parseInt(id));
  }

  /**
   * POST /api/ingestion/admin/proxies/test
   * 
   * Тестувати всі проксі
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testAll() {
    return this.proxyService.test();
  }

  /**
   * POST /api/ingestion/admin/proxies/:id/test
   * 
   * Тестувати конкретний проксі
   */
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testOne(@Param('id') id: string) {
    return this.proxyService.test(parseInt(id));
  }
}
