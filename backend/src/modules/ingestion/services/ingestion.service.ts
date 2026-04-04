import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ParserRawData } from '../schemas/parser-raw-data.schema';
import { Vehicle } from '../schemas/vehicle.schema';
import { VehicleService } from './vehicle.service';
import { ParserVehicleDto, ParserWebhookResponseDto, ParserBatchDto, ParserBatchResponseDto } from '../dto/parser-webhook.dto';
import { ProcessingStatus, VehicleStatus } from '../enums/vehicle.enum';
import { ActivityService } from '../../activity/services/activity.service';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../../activity/enums/activity-action.enum';
import { generateId } from '../../../shared/utils';

/**
 * Ingestion Service
 * 
 * Відповідає за:
 * - Прийом webhook від парсерів
 * - Зберігання raw data
 * - Нормалізацію даних
 * - Передачу до VehicleService
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectModel(ParserRawData.name) private rawDataModel: Model<ParserRawData>,
    private readonly vehicleService: VehicleService,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * Обробка одного vehicle від парсера
   */
  async processVehicleWebhook(
    dto: ParserVehicleDto,
    sourceIp?: string,
  ): Promise<ParserWebhookResponseDto> {
    const rawDataId = generateId();
    
    // 1. Зберігаємо raw data
    const rawData = await this.saveRawData(rawDataId, dto, sourceIp);

    try {
      // 2. Валідація VIN
      if (!this.isValidVin(dto.vin)) {
        await this.updateRawDataStatus(rawDataId, ProcessingStatus.FAILED, 'Invalid VIN format');
        return {
          success: false,
          action: 'skipped',
          message: 'Invalid VIN format',
          rawDataId,
        };
      }

      // 3. Нормалізуємо дані
      const normalizedData = this.normalizeVehicleData(dto);

      // 4. Дедуплікація та збереження через VehicleService
      const result = await this.vehicleService.upsertByVin(normalizedData);

      // 5. Оновлюємо статус raw data
      await this.updateRawDataStatus(
        rawDataId,
        ProcessingStatus.PROCESSED,
        undefined,
        result.id,
      );

      // 6. Логуємо activity
      this.activityService.logAsync({
        userId: 'system',
        userRole: 'system',
        userName: 'Parser Integration',
        action: result.isNew ? ActivityAction.VEHICLE_CREATED : ActivityAction.VEHICLE_UPDATED,
        entityType: ActivityEntityType.VEHICLE,
        entityId: result.id,
        meta: {
          vin: dto.vin,
          source: dto.source,
          externalId: dto.externalId,
          action: result.isNew ? 'created' : 'updated',
        },
        context: {
          source: ActivitySource.API,
          ip: sourceIp,
        },
      });

      return {
        success: true,
        vehicleId: result.id,
        vin: dto.vin,
        action: result.isNew ? 'created' : 'updated',
        rawDataId,
      };
    } catch (error) {
      this.logger.error(`Failed to process vehicle ${dto.vin}: ${error.message}`);
      
      await this.updateRawDataStatus(rawDataId, ProcessingStatus.FAILED, error.message);
      
      return {
        success: false,
        vin: dto.vin,
        action: 'skipped',
        message: error.message,
        rawDataId,
      };
    }
  }

  /**
   * Batch обробка
   */
  async processBatch(dto: ParserBatchDto): Promise<ParserBatchResponseDto> {
    const results: ParserWebhookResponseDto[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const vehicle of dto.vehicles) {
      const vehicleDto: ParserVehicleDto = {
        ...vehicle,
        source: dto.source,
      };

      const result = await this.processVehicleWebhook(vehicleDto);
      results.push(result);

      if (result.success) {
        if (result.action === 'created') created++;
        if (result.action === 'updated') updated++;
      } else {
        if (result.action === 'skipped') skipped++;
        else failed++;
      }
    }

    this.logger.log(`Batch processed: ${dto.vehicles.length} vehicles (${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed)`);

    return {
      success: failed === 0,
      total: dto.vehicles.length,
      created,
      updated,
      skipped,
      failed,
      results,
    };
  }

  /**
   * Збереження raw data
   */
  private async saveRawData(
    id: string,
    dto: ParserVehicleDto,
    sourceIp?: string,
  ): Promise<ParserRawData> {
    const checksum = this.calculateChecksum(dto);

    const rawData = new this.rawDataModel({
      id,
      source: dto.source,
      externalId: dto.externalId,
      vin: dto.vin,
      payload: dto,
      processingStatus: ProcessingStatus.PENDING,
      receivedAt: new Date(),
      sourceIp,
      payloadChecksum: checksum,
    });

    return await rawData.save();
  }

  /**
   * Оновлення статусу raw data
   */
  private async updateRawDataStatus(
    id: string,
    status: ProcessingStatus,
    error?: string,
    vehicleId?: string,
  ): Promise<void> {
    await this.rawDataModel.updateOne(
      { id },
      {
        processingStatus: status,
        processingError: error,
        vehicleId,
        processedAt: new Date(),
        $inc: { processingAttempts: 1 },
      },
    );
  }

  /**
   * Нормалізація даних від парсера
   */
  private normalizeVehicleData(dto: ParserVehicleDto): Partial<Vehicle> {
    // Генеруємо title якщо не вказано
    const title = dto.title || this.generateTitle(dto);

    return {
      vin: dto.vin.toUpperCase().trim(),
      source: dto.source,
      externalId: dto.externalId,
      title,
      description: dto.description,
      make: dto.make,
      vehicleModel: dto.model, // map 'model' from DTO to 'vehicleModel' in schema
      year: dto.year,
      mileage: dto.mileage,
      mileageUnit: dto.mileageUnit || 'miles',
      color: dto.color,
      bodyType: dto.bodyType,
      engineType: dto.engineType,
      transmission: dto.transmission,
      drivetrain: dto.drivetrain,
      price: dto.price,
      currency: dto.currency || 'USD',
      estimatedRetailValue: dto.estimatedRetailValue,
      repairCost: dto.repairCost,
      images: dto.images || [],
      primaryImage: dto.primaryImage || (dto.images && dto.images[0]),
      conditionGrade: dto.conditionGrade,
      damageType: dto.damageType,
      damageDescription: dto.damageDescription,
      hasKeys: dto.hasKeys,
      isRunnable: dto.isRunnable,
      auctionDate: dto.auctionDate ? new Date(dto.auctionDate) : undefined,
      auctionLocation: dto.auctionLocation,
      lotNumber: dto.lotNumber || dto.externalId,
      saleStatus: dto.saleStatus,
      sourceUrl: dto.sourceUrl,
      metadata: dto.metadata,
      status: VehicleStatus.ACTIVE,
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Генерація title з наявних даних
   */
  private generateTitle(dto: ParserVehicleDto): string {
    const parts: string[] = [];
    
    if (dto.year) parts.push(dto.year.toString());
    if (dto.make) parts.push(dto.make);
    if (dto.model) parts.push(dto.model);
    
    if (parts.length === 0) {
      return `Vehicle ${dto.vin.slice(-6)}`;
    }
    
    return parts.join(' ');
  }

  /**
   * Валідація VIN
   */
  private isValidVin(vin: string): boolean {
    if (!vin) return false;
    const cleanVin = vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
    return cleanVin.length === 17;
  }

  /**
   * Розрахунок checksum для дедуплікації
   */
  private calculateChecksum(dto: ParserVehicleDto): string {
    const data = JSON.stringify({
      vin: dto.vin,
      source: dto.source,
      price: dto.price,
      status: dto.saleStatus,
    });
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Отримати raw data для debug
   */
  async getRawData(filters: {
    source?: string;
    vin?: string;
    status?: ProcessingStatus;
    limit?: number;
  }): Promise<any[]> {
    const query: any = {};
    
    if (filters.source) query.source = filters.source;
    if (filters.vin) query.vin = filters.vin;
    if (filters.status) query.processingStatus = filters.status;

    const data = await this.rawDataModel
      .find(query)
      .sort({ receivedAt: -1 })
      .limit(filters.limit || 50)
      .exec();

    return data.map(d => {
      const { _id, __v, ...rest } = d.toObject();
      return rest;
    });
  }

  /**
   * Повторна обробка failed records
   */
  async reprocessFailed(limit: number = 100): Promise<{ processed: number; success: number; failed: number }> {
    const failedRecords = await this.rawDataModel
      .find({
        processingStatus: ProcessingStatus.FAILED,
        processingAttempts: { $lt: 3 },
      })
      .limit(limit)
      .exec();

    let success = 0;
    let failed = 0;

    for (const record of failedRecords) {
      try {
        const result = await this.processVehicleWebhook(record.payload as ParserVehicleDto);
        if (result.success) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    return { processed: failedRecords.length, success, failed };
  }
}
