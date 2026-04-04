import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  Query, 
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { IngestionService } from '../services/ingestion.service';
import { VehicleService } from '../services/vehicle.service';
import { ParserVehicleDto, ParserBatchDto } from '../dto/parser-webhook.dto';
import { VehicleQueryDto } from '../dto/vehicle-query.dto';
import { VehicleStatus } from '../enums/vehicle.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

// Runners
import { CopartRunner } from '../runners/copart.runner';
import { IAAIRunner } from '../runners/iaai.runner';

// Antiblock
import { ParserHealthService, CircuitBreakerService } from '../antiblock';

/**
 * Parser Webhook Controller
 * 
 * Публічні endpoints для прийому даних від парсерів
 * Приватні endpoints для управління vehicles
 * Runner endpoints для запуску парсерів
 */
@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly vehicleService: VehicleService,
    private readonly copartRunner: CopartRunner,
    private readonly iaaiRunner: IAAIRunner,
    private readonly parserHealth: ParserHealthService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  // ==================== WEBHOOK ENDPOINTS (PUBLIC) ====================

  /**
   * POST /api/ingestion/parser/vehicle
   * 
   * Webhook для прийому одного vehicle від парсера
   */
  @Post('parser/vehicle')
  @HttpCode(HttpStatus.OK)
  async receiveVehicle(
    @Body() dto: ParserVehicleDto,
    @Req() req: Request,
  ) {
    const sourceIp = req.ip || req.socket.remoteAddress;
    return await this.ingestionService.processVehicleWebhook(dto, sourceIp);
  }

  /**
   * POST /api/ingestion/parser/batch
   * 
   * Webhook для batch import
   */
  @Post('parser/batch')
  @HttpCode(HttpStatus.OK)
  async receiveBatch(
    @Body() dto: ParserBatchDto,
  ) {
    return await this.ingestionService.processBatch(dto);
  }

  // ==================== VEHICLE ENDPOINTS (PROTECTED) ====================

  /**
   * GET /api/ingestion/vehicles
   * 
   * Список vehicles з фільтрами
   */
  @Get('vehicles')
  @UseGuards(JwtAuthGuard)
  async listVehicles(@Query() query: VehicleQueryDto) {
    return await this.vehicleService.findAll(query);
  }

  /**
   * GET /api/ingestion/vehicles/stats
   * 
   * Статистика для dashboard
   */
  @Get('vehicles/stats')
  @UseGuards(JwtAuthGuard)
  async getStats() {
    return await this.vehicleService.getStats();
  }

  /**
   * GET /api/ingestion/vehicles/makes
   * 
   * Унікальні makes для фільтрів
   */
  @Get('vehicles/makes')
  @UseGuards(JwtAuthGuard)
  async getMakes() {
    return await this.vehicleService.getUniqueMakes();
  }

  /**
   * GET /api/ingestion/vehicles/models
   * 
   * Унікальні models для фільтрів
   */
  @Get('vehicles/models')
  @UseGuards(JwtAuthGuard)
  async getModels(@Query('make') make?: string) {
    return await this.vehicleService.getUniqueModels(make);
  }

  /**
   * GET /api/ingestion/vehicles/:id
   * 
   * Отримати vehicle по ID
   */
  @Get('vehicles/:id')
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id') id: string) {
    return await this.vehicleService.findById(id);
  }

  /**
   * GET /api/ingestion/vehicles/vin/:vin
   * 
   * Отримати vehicle по VIN
   */
  @Get('vehicles/vin/:vin')
  @UseGuards(JwtAuthGuard)
  async getByVin(@Param('vin') vin: string) {
    return await this.vehicleService.findByVin(vin);
  }

  /**
   * POST /api/ingestion/vehicles/:id/status
   * 
   * Змінити статус vehicle
   */
  @Post('vehicles/:id/status')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: VehicleStatus; userId?: string },
  ) {
    return await this.vehicleService.updateStatus(id, body.status, body.userId);
  }

  /**
   * POST /api/ingestion/vehicles/:id/link
   * 
   * Link vehicle to CRM entity
   */
  @Post('vehicles/:id/link')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async linkToCrm(
    @Param('id') id: string,
    @Body() body: { leadId?: string; dealId?: string },
  ) {
    return await this.vehicleService.linkToCrm(id, body);
  }

  // ==================== DEBUG/ADMIN ENDPOINTS ====================

  /**
   * GET /api/ingestion/raw-data
   * 
   * Отримати raw data для debug (admin only)
   */
  @Get('raw-data')
  @UseGuards(JwtAuthGuard)
  async getRawData(
    @Query('source') source?: string,
    @Query('vin') vin?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.ingestionService.getRawData({
      source,
      vin,
      status: status as any,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  /**
   * POST /api/ingestion/reprocess
   * 
   * Повторна обробка failed records
   */
  @Post('reprocess')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async reprocessFailed(@Body() body: { limit?: number }) {
    return await this.ingestionService.reprocessFailed(body.limit);
  }

  // ==================== RUNNER ENDPOINTS ====================

  /**
   * GET /api/ingestion/runners/status
   * 
   * Статус всіх runners
   */
  @Get('runners/status')
  @UseGuards(JwtAuthGuard)
  async getRunnersStatus() {
    return {
      copart: this.copartRunner.getStatus(),
      iaai: this.iaaiRunner.getStatus(),
      health: this.parserHealth.getSummary(),
      circuitBreakers: this.circuitBreaker.getAllStates(),
    };
  }

  /**
   * POST /api/ingestion/runners/copart/run
   * 
   * Запустити Copart parser вручну
   */
  @Post('runners/copart/run')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async runCopart() {
    return await this.copartRunner.runManual();
  }

  /**
   * POST /api/ingestion/runners/iaai/run
   * 
   * Запустити IAAI parser вручну
   */
  @Post('runners/iaai/run')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async runIAAI() {
    return await this.iaaiRunner.runManual();
  }

  /**
   * POST /api/ingestion/runners/all/run
   * 
   * Запустити всі parsers
   */
  @Post('runners/all/run')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async runAll() {
    const copartResult = await this.copartRunner.runManual();
    const iaaiResult = await this.iaaiRunner.runManual();
    
    return {
      copart: copartResult,
      iaai: iaaiResult,
    };
  }

  /**
   * GET /api/ingestion/health
   * 
   * Parser health dashboard
   */
  @Get('health')
  @UseGuards(JwtAuthGuard)
  async getHealthDashboard() {
    return {
      parsers: this.parserHealth.getAllHealth(),
      summary: this.parserHealth.getSummary(),
      circuitBreakers: this.circuitBreaker.getAllStates(),
    };
  }

  /**
   * POST /api/ingestion/circuit-breaker/reset
   * 
   * Reset circuit breaker для парсера
   */
  @Post('circuit-breaker/reset')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async resetCircuitBreaker(@Body() body: { parserId?: string }) {
    if (body.parserId) {
      this.circuitBreaker.reset(body.parserId);
    } else {
      this.circuitBreaker.resetAll();
    }
    return { success: true };
  }
}
