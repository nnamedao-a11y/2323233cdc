/**
 * Copart Runner
 * 
 * Парсер для Copart.com з anti-block захистом:
 * - Proxy rotation
 * - Fingerprint randomization
 * - Circuit breaker
 * - Retry з exponential backoff
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

// Normalizers
import { normalizeCopart, CopartRawItem } from '../normalize/copart.normalize';

// Enums
import { VehicleSource, ProcessingStatus } from '../enums/vehicle.enum';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../../activity/enums/activity-action.enum';
import { generateId } from '../../../shared/utils';

// Scraping - browser-based scraping with XHR interception
import { universalScrape } from '../scraping-core';

interface CopartApiResponse {
  data?: {
    results?: {
      content?: CopartRawItem[];
    };
    content?: CopartRawItem[];
  };
  results?: CopartRawItem[];
  content?: CopartRawItem[];
  lots?: CopartRawItem[];
}

@Injectable()
export class CopartRunner implements OnModuleInit {
  private readonly logger = new Logger(CopartRunner.name);
  private isRunning = false;
  private lastRunAt: Date | null = null;

  // Copart API endpoints (placeholder - потребує реального API)
  private readonly COPART_SEARCH_URL = 'https://www.copart.com/public/data/lotSearchResults';
  
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
    this.logger.log('[CopartRunner] Initialized');
  }

  // ========================================
  // CRON JOB
  // ========================================

  @Cron('0 */4 * * *') // Кожні 4 години
  async cronRun() {
    this.logger.log('[CRON] Starting Copart parser...');
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
      // Використовуємо ParserGuard для circuit breaker + health tracking
      const guardResult = await this.parserGuard.runGuarded(
        'copart_main',
        'Copart Main Parser',
        async () => {
          // Fetch raw data from Copart
          const rawItems = await this.fetchCopartData();
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

      // Process each item
      for (const item of rawItems) {
        try {
          await this.processItem(item);
          
          // Перевіряємо чи created чи updated
          const vin = item.vin || item.fv || item.vehicle?.vin;
          if (vin) {
            const existing = await this.vehicleService.findByVin(vin).catch(() => null);
            if (existing) {
              updated++;
            } else {
              created++;
            }
          }

          // Human-like pause between items
          await humanPause(100, 300);
        } catch (error) {
          failed++;
          errors.push(`Item ${item.id || item.lotId}: ${error.message}`);
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
      this.logger.error(`[CopartRunner] Run failed: ${error.message}`);
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

  private async fetchCopartData(): Promise<CopartRawItem[]> {
    // Метод 1: Direct API (якщо доступний)
    try {
      return await this.fetchViaApi();
    } catch (error) {
      this.logger.warn(`[CopartRunner] API fetch failed: ${error.message}, trying browser...`);
    }

    // Метод 2: Browser scraping (with XHR interception)
    try {
      return await this.fetchViaBrowser();
    } catch (error) {
      this.logger.warn(`[CopartRunner] Browser scraping failed: ${error.message}`);
    }

    this.logger.warn('[CopartRunner] All data sources failed');
    return [];
  }

  private async fetchViaBrowser(): Promise<CopartRawItem[]> {
    this.logger.log('[CopartRunner] Starting browser scraping...');
    
    // Copart search URLs - different categories
    const searchUrls = [
      'https://www.copart.com/lotSearchResults?free=true&query=&searchCriteria=%7B%22query%22%3A%5B%22*%22%5D%2C%22filter%22%3A%7B%22YEAR%22%3A%5B%222020%20TO%202024%22%5D%7D%2C%22sort%22%3A%5B%22auction_date_type%20desc%22%5D%2C%22page%22%3A0%2C%22size%22%3A100%7D',
    ];

    const allItems: CopartRawItem[] = [];

    for (const url of searchUrls) {
      try {
        const result = await universalScrape(url, {
          maxPages: 3,
          scrollCount: 5,
          waitTime: 3000,
        });

        this.logger.log(`[CopartRunner] Browser scraped ${result.items.length} items via ${result.method}`);
        
        // DEBUG: Log sample item structure
        if (result.items.length > 0) {
          const sample = result.items[0];
          this.logger.log(`[CopartRunner] Sample item keys: ${Object.keys(sample).join(', ')}`);
          this.logger.log(`[CopartRunner] Sample item: ${JSON.stringify(sample).substring(0, 500)}`);
        }
        
        // Transform to CopartRawItem format - using REAL Copart API field names
        for (const item of result.items) {
          // DEBUG: log tims structure
          this.logger.log(`[CopartRunner] Item tims type: ${typeof item.tims}, value: ${JSON.stringify(item.tims).substring(0, 200)}`);
          
          // Process images - tims can be undefined, array, or object
          let images: string[] = [];
          if (Array.isArray(item.tims)) {
            images = item.tims.map((t: any) => t?.full || t).filter(Boolean);
          } else if (item.tims && typeof item.tims === 'object') {
            // Handle object format
            Object.values(item.tims).forEach((v: any) => {
              if (typeof v === 'string') images.push(v);
              else if (v?.full) images.push(v.full);
            });
          }
          
          const rawItem: CopartRawItem = {
            id: String(item.ln || item.lotNumberStr || ''),
            lotId: String(item.ln || item.lotNumberStr || ''),
            ln: String(item.ln || ''),
            vin: item.fv || '',  // fv = full VIN
            fv: item.fv || '',
            title: item.ltd || item.lm || `${item.lcy || ''} ${item.mkn || ''} ${item.lm || ''}`.trim(),
            year: item.lcy,  // lcy = lot year
            lcy: item.lcy,
            make: item.mkn,  // mkn = make name
            mkn: item.mkn,
            model: item.lm,  // lm = model
            mdn: item.lm,
            currentBid: item.obc || item.dynamicLotDetails?.currentBid,  // obc = current bid
            obc: item.obc,
            buyItNowPrice: item.bnp,  // bnp = buy now price
            bnp: item.bnp,
            imageUrl: images[0] || '',
            images: images,
            tims: item.tims,
            saleDate: item.ad,  // ad = auction date
            location: item.yn || item.locState || '',  // yn = yard name
            yn: item.yn,
            damageType: item.dd || item.td || '',  // dd = damage description
            dd: item.dd,
            pdd: item.td,
            driveType: item.drv,  // drv = drive type
            dtc: item.drv,
            engine: item.egn,  // egn = engine
            ey: item.egn,
            transmission: item.htsmn || item.tmtp,  // htsmn = transmission
            tsmn: item.htsmn,
            fuelType: item.ft,  // ft = fuel type
            odometer: item.orr,  // orr = odometer reading
            odo: item.orr,
            keys: item.hk,  // hk = has keys
            color: item.clr,
            clr: item.clr,
            highlights: item.ld,  // ld = lot description
          };
          allItems.push(rawItem);
        }
      } catch (error) {
        this.logger.warn(`[CopartRunner] Failed to scrape ${url}: ${error.message}`);
      }
    }

    return allItems;
  }

  private async fetchViaApi(): Promise<CopartRawItem[]> {
    const headers = this.httpFingerprint.buildHeaders({ kind: 'json' });
    
    // Приклад запиту до Copart API
    // Реальний API може вимагати автентифікації або інший формат
    const response = await withRetry(
      async () => {
        const res = await fetch(this.COPART_SEARCH_URL, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filter: {},
            sort: [{ field: 'auction_date_utc', direction: 'asc' }],
            page: 0,
            size: 100,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        return res.json() as Promise<CopartApiResponse>;
      },
      { retries: 3, baseDelayMs: 2000 }
    );

    // Extract items from response
    return this.extractItemsFromResponse(response);
  }

  private extractItemsFromResponse(response: CopartApiResponse): CopartRawItem[] {
    // Handle different response structures
    if (response.data?.results?.content) {
      return response.data.results.content;
    }
    if (response.data?.content) {
      return response.data.content;
    }
    if (response.results) {
      return response.results;
    }
    if (response.content) {
      return response.content;
    }
    if (response.lots) {
      return response.lots;
    }
    return [];
  }

  // ========================================
  // PROCESS SINGLE ITEM
  // ========================================

  private async processItem(item: CopartRawItem): Promise<void> {
    const rawId = generateId();

    // Debug log incoming item
    const itemVin = item.vin || item.fv || item.vehicle?.vin || 'NO_VIN';
    this.logger.log(`[CopartRunner] Processing item: VIN=${itemVin}, lotId=${item.lotId || item.ln || item.id}`);

    // 1. Save raw data
    await this.saveRawData(rawId, item);

    // 2. Normalize
    const normalized = normalizeCopart(item);

    if (!normalized) {
      this.logger.warn(`[CopartRunner] Normalization failed for VIN=${itemVin} (invalid or missing VIN)`);
      await this.updateRawStatus(rawId, ProcessingStatus.FAILED, 'Normalization failed (invalid VIN)');
      return;
    }

    this.logger.log(`[CopartRunner] Normalized successfully: VIN=${normalized.vin}`);

    // 3. Upsert vehicle (dedup by VIN)
    let vehicleResult: { id: string; isNew: boolean };
    try {
      vehicleResult = await this.vehicleService.upsertByVin(normalized);
      this.logger.log(`[CopartRunner] Vehicle ${vehicleResult.isNew ? 'CREATED' : 'UPDATED'}: ${vehicleResult.id} (VIN: ${normalized.vin})`);

      // 4. Update raw status
      await this.updateRawStatus(rawId, ProcessingStatus.PROCESSED, undefined, vehicleResult.id);
    } catch (error) {
      this.logger.error(`[CopartRunner] Failed to save vehicle VIN=${normalized.vin}: ${error.message}`);
      await this.updateRawStatus(rawId, ProcessingStatus.FAILED, error.message);
      throw error;
    }

    // 5. Log activity
    this.activityService.logAsync({
      userId: 'system',
      userRole: 'system',
      userName: 'Copart Parser',
      action: vehicleResult.isNew ? ActivityAction.VEHICLE_CREATED : ActivityAction.VEHICLE_UPDATED,
      entityType: ActivityEntityType.VEHICLE,
      entityId: vehicleResult.id,
      meta: {
        vin: normalized.vin,
        source: 'copart',
        externalId: normalized.externalId,
        runner: 'copart',
      },
      context: {
        source: ActivitySource.AUTOMATION,
      },
    });
  }

  // ========================================
  // RAW DATA STORAGE
  // ========================================

  private async saveRawData(id: string, item: CopartRawItem): Promise<void> {
    await this.rawDataModel.create({
      id,
      source: VehicleSource.COPART,
      externalId: String(item.id || item.lotId || item.ln || ''),
      vin: item.vin || item.fv || item.vehicle?.vin,
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
      health: this.parserHealth.getHealth('copart_main'),
      circuitBreaker: this.circuitBreaker.getState('copart_main'),
    };
  }

  // ========================================
  // MANUAL TRIGGER
  // ========================================

  async runManual(): Promise<any> {
    return this.run();
  }
}
