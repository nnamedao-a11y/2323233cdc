/**
 * Proxy Admin Controller
 * 
 * Admin API for proxy management
 */

import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { EnhancedProxyPoolService } from './enhanced-proxy-pool.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('admin/proxy')
@UseGuards(JwtAuthGuard)
export class ProxyAdminController {
  constructor(private readonly proxyService: EnhancedProxyPoolService) {}

  @Get('status')
  getStatus() {
    return this.proxyService.getStatus();
  }

  @Post('add')
  @HttpCode(HttpStatus.OK)
  async addProxy(
    @Body() body: { 
      host: string; 
      port: number;
      protocol?: 'http' | 'https' | 'socks5';
      username?: string; 
      password?: string; 
      priority?: number;
    },
  ) {
    // Build server URL from components
    const protocol = body.protocol || 'http';
    const server = `${protocol}://${body.host}:${body.port}`;
    
    return this.proxyService.addProxy(
      server,
      body.username,
      body.password,
      body.priority,
    );
  }

  @Delete('remove/:id')
  async removeProxy(@Param('id') id: string) {
    return this.proxyService.removeProxy(parseInt(id, 10));
  }

  @Post('priority/:id')
  @HttpCode(HttpStatus.OK)
  async setPriority(
    @Param('id') id: string,
    @Body() body: { priority: number },
  ) {
    return this.proxyService.setPriority(parseInt(id, 10), body.priority);
  }

  @Post('enable/:id')
  @HttpCode(HttpStatus.OK)
  async enableProxy(@Param('id') id: string) {
    return this.proxyService.enableProxy(parseInt(id, 10));
  }

  @Post('disable/:id')
  @HttpCode(HttpStatus.OK)
  async disableProxy(@Param('id') id: string) {
    return this.proxyService.disableProxy(parseInt(id, 10));
  }

  @Post('clear')
  @HttpCode(HttpStatus.OK)
  async clearAll() {
    await this.proxyService.clearAll();
    return { ok: true };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testProxy(@Query('id') id?: string) {
    return this.proxyService.testProxy(id ? parseInt(id, 10) : undefined);
  }

  @Post('test/:id')
  @HttpCode(HttpStatus.OK)
  async testProxyById(@Param('id') id: string) {
    return this.proxyService.testProxy(parseInt(id, 10));
  }

  @Post('reload')
  @HttpCode(HttpStatus.OK)
  async reload() {
    await this.proxyService.loadFromDb();
    return { ok: true, status: this.proxyService.getStatus() };
  }
}
