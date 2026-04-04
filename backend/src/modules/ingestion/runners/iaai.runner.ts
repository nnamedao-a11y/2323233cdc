/**
 * IAAI Runner
 * 
 * Парсер для IAAI.com (Insurance Auto Auctions) з anti-block захистом
 * 
 * Flow:
 * Scrape → Raw Storage → Normalize → Dedup (VIN) → Vehicle → Activity
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';

// Schemas
import { ParserRawData } from '../schemas/parser-raw-data.schema';
import { Vehicle } from '../schemas/vehicle.schema';

// Services
import { VehicleService } from '../services/vehicle.service';
import { ActivityService } from '../../activity/services/activity.service';

// Antiblock
import {
  CircuitBreakerService,
  ParserHealthService,
  ParserGuardService,
  HttpFingerprintService,
  withRetry,
  humanPause,
} from '../antiblock';

// Scraping - browser-based scraping with XHR interception  
import { universalScrape } from '../scraping-core';

// Normalizers
import { normalizeIAAI, IAAIRawItem } from '../normalize/iaai.normalize';

// Enums
import { VehicleSource, ProcessingStatus } from '../enums/vehicle.enum';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../../activity/enums/activity-action.enum';
import { generateId } from '../../../shared/utils';

interface IAAIApiResponse {
  data?: IAAIRawItem[];
  items?: IAAIRawItem[];
  vehicles?: IAAIRawItem[];
  results?: IAAIRawItem[];
  content?: IAAIRawItem[];
}

@Injectable()
export class IAAIRunner implements OnModuleInit {
  private readonly logger = new Logger(IAAIRunner.name);
  private isRunning = false;
  private lastRunAt: Date | null = null;

  // IAAI API endpoints (placeholder)
  private readonly IAAI_SEARCH_URL = 'https://www.iaai.com/Search';
  
  constructor(
    @InjectModel(ParserRawData.name) private rawDataModel: Model<ParserRawData>,
    private readonly vehicleService: VehicleService,
    private readonly activityService: ActivityService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly parserHealth: ParserHealthService,
    private readonly parserGuard: ParserGuardService,
    private readonly httpFingerprint: HttpFingerprintService,
  ) {}

  async onModuleInit() {
    this.logger.log('[IAAIRunner] Initialized');
  }

  // ========================================
  // CRON JOB
  // ========================================

  @Cron('30 */4 * * *') // Кожні 4 години, зміщено на 30 хв від Copart
  async cronRun() {
    this.logger.log('[CRON] Starting IAAI parser...');
    await this.run();
  }

  // ========================================
  // MAIN RUN METHOD
  // ========================================

  async run(): Promise<{
    success: boolean;
    fetched: number;
    created: number;
    updated: number;
    failed: number;
    durationMs: number;
    errors: string[];
  }> {
    if (this.isRunning) {
      return {
        success: false,
        fetched: 0,
        created: 0,
        updated: 0,
        failed: 0,
        durationMs: 0,
        errors: ['Another run is in progress'],
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const errors: string[] = [];
    let fetched = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;

    try {
      const guardResult = await this.parserGuard.runGuarded(
        'iaai_main',
        'IAAI Main Parser',
        async () => {
          const rawItems = await this.fetchIAAIData();
          return rawItems;
        }
      );

      if (guardResult.skipped) {
        return {
          success: false,
          fetched: 0,
          created: 0,
          updated: 0,
          failed: 0,
          durationMs: Date.now() - startTime,
          errors: ['Skipped: circuit breaker open'],
        };
      }

      if (!guardResult.success || !guardResult.result) {
        return {
          success: false,
          fetched: 0,
          created: 0,
          updated: 0,
          failed: 0,
          durationMs: Date.now() - startTime,
          errors: [guardResult.error || 'Unknown error'],
        };
      }

      const rawItems = guardResult.result;
      fetched = rawItems.length;

      for (const item of rawItems) {
        try {
          const processResult = await this.processItem(item);
          
          if (processResult === 'created') {
            created++;
          } else if (processResult === 'updated') {
            updated++;
          }

          await humanPause(100, 300);
        } catch (error) {
          failed++;
          errors.push(`Item ${item.stockNumber || item.itemId}: ${error.message}`);
        }
      }

      this.lastRunAt = new Date();

      return {
        success: true,
        fetched,
        created,
        updated,
        failed,
        durationMs: Date.now() - startTime,
        errors,
      };

    } catch (error) {
      this.logger.error(`[IAAIRunner] Run failed: ${error.message}`);
      return {
        success: false,
        fetched,
        created,
        updated,
        failed,
        durationMs: Date.now() - startTime,
        errors: [error.message],
      };
    } finally {
      this.isRunning = false;
    }
  }

  // ========================================
  // FETCH DATA
  // ========================================

  private async fetchIAAIData(): Promise<IAAIRawItem[]> {
    try {
      return await this.fetchViaApi();
    } catch (error) {
      this.logger.warn(`[IAAIRunner] API fetch failed: ${error.message}, trying browser...`);
    }

    // Fallback to browser scraping
    try {
      return await this.fetchViaBrowser();
    } catch (error) {
      this.logger.warn(`[IAAIRunner] Browser scraping failed: ${error.message}`);
    }

    this.logger.warn('[IAAIRunner] All data sources failed');
    return [];
  }

  private async fetchViaBrowser(): Promise<IAAIRawItem[]> {
    this.logger.log('[IAAIRunner] Starting browser scraping...');
    
    const searchUrls = [
      'https://www.iaai.com/Search?wl=&rnd=123456',
    ];

    const allItems: IAAIRawItem[] = [];

    for (const url of searchUrls) {
      try {
        const result = await universalScrape(url, {
          maxPages: 3,
          scrollCount: 5,
          waitTime: 3000,
        });

        this.logger.log(`[IAAIRunner] Browser scraped ${result.items.length} items via ${result.method}`);
        
        // Transform to IAAIRawItem format
        for (const item of result.items) {
          const rawItem: IAAIRawItem = {
            stockNo: item.stockNo || item.StockNo || item.id,
            vin: item.vin || item.VIN,
            vehicleName: item.vehicleName || item.VehicleName || item.title,
            year: item.year || item.Year,
            make: item.make || item.Make,
            model: item.model || item.Model,
            currentBid: item.currentBid || item.CurrentBid,
            buyNow: item.buyNow || item.BuyNow,
            image: item.image || item.Image || item.imageUrl,
            images: item.images || [],
            saleDate: item.saleDate || item.SaleDate,
            branch: item.branch || item.Branch || item.location,
            primaryDamage: item.primaryDamage || item.PrimaryDamage,
            secondaryDamage: item.secondaryDamage || item.SecondaryDamage,
            driveType: item.driveType || item.DriveType,
            engine: item.engine || item.Engine,
            transmission: item.transmission || item.Transmission,
            fuelType: item.fuelType || item.FuelType,
            odometer: item.odometer || item.Odometer,
            keys: item.keys || item.Keys,
            titleType: item.titleType || item.TitleType,
          };
          allItems.push(rawItem);
        }
      } catch (error) {
        this.logger.warn(`[IAAIRunner] Failed to scrape ${url}: ${error.message}`);
      }
    }

    return allItems;
  }

  private async fetchViaApi(): Promise<IAAIRawItem[]> {
    const headers = this.httpFingerprint.buildHeaders({ kind: 'json' });
    
    const response = await withRetry(
      async () => {
        const res = await fetch(this.IAAI_SEARCH_URL, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Ession: {},
            SearchParams: {
              PageNumber: 1,
              PageSize: 100,
            },
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        return res.json() as Promise<IAAIApiResponse>;
      },
      { retries: 3, baseDelayMs: 2000 }
    );

    return this.extractItemsFromResponse(response);
  }

  private extractItemsFromResponse(response: IAAIApiResponse): IAAIRawItem[] {
    if (response.data) return response.data;
    if (response.items) return response.items;
    if (response.vehicles) return response.vehicles;
    if (response.results) return response.results;
    if (response.content) return response.content;
    return [];
  }

  // ========================================
  // PROCESS SINGLE ITEM
  // ========================================

  private async processItem(item: IAAIRawItem): Promise<'created' | 'updated' | 'skipped'> {
    const rawId = generateId();

    // 1. Save raw data
    await this.saveRawData(rawId, item);

    // 2. Normalize
    const normalized = normalizeIAAI(item);

    if (!normalized) {
      await this.updateRawStatus(rawId, ProcessingStatus.FAILED, 'Normalization failed (invalid VIN)');
      return 'skipped';
    }

    // 3. Upsert vehicle
    const result = await this.vehicleService.upsertByVin(normalized);

    // 4. Update raw status
    await this.updateRawStatus(rawId, ProcessingStatus.PROCESSED, undefined, result.id);

    // 5. Log activity
    this.activityService.logAsync({
      userId: 'system',
      userRole: 'system',
      userName: 'IAAI Parser',
      action: result.isNew ? ActivityAction.VEHICLE_CREATED : ActivityAction.VEHICLE_UPDATED,
      entityType: ActivityEntityType.VEHICLE,
      entityId: result.id,
      meta: {
        vin: normalized.vin,
        source: 'iaai',
        externalId: normalized.externalId,
        runner: 'iaai',
      },
      context: {
        source: ActivitySource.AUTOMATION,
      },
    });

    return result.isNew ? 'created' : 'updated';
  }

  // ========================================
  // RAW DATA STORAGE
  // ========================================

  private async saveRawData(id: string, item: IAAIRawItem): Promise<void> {
    await this.rawDataModel.create({
      id,
      source: VehicleSource.IAAI,
      externalId: String(item.stockNumber || item.itemNumber || item.itemId || ''),
      vin: item.vin || item.vehicleVin || item.vehicleInfo?.vin,
      payload: item,
      processingStatus: ProcessingStatus.PENDING,
      receivedAt: new Date(),
    });
  }

  private async updateRawStatus(
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

  // ========================================
  // STATUS
  // ========================================

  getStatus(): {
    isRunning: boolean;
    lastRunAt: Date | null;
    health: any;
    circuitBreaker: any;
  } {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      health: this.parserHealth.getHealth('iaai_main'),
      circuitBreaker: this.circuitBreaker.getState('iaai_main'),
    };
  }

  async runManual(): Promise<any> {
    return this.run();
  }
}
