/**
 * History Provider Service
 * 
 * Wrapper для зовнішніх провайдерів history reports:
 * - CarVertical (Europe)
 * - Carfax (US)
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { IntegrationConfigService } from '../../integration-config/integration-config.service';
import { IntegrationProvider } from '../../integration-config/schemas/integration-config.schema';
import axios from 'axios';

export interface HistoryReportResult {
  vin: string;
  provider: string;
  rawData: Record<string, any>;
  normalizedData: {
    vin: string;
    accidentHistory: string[];
    ownersCount: number;
    titleIssues: string[];
    odometerFlags: string[];
    auctionHistory: any[];
    damageHistory: string[];
    serviceRecords: any[];
    historyScore?: number;
  };
  cost: number;
}

const CARVERTICAL_API_URL = 'https://api.carvertical.com/v1';
const CARFAX_API_URL = 'https://api.carfax.com/v1';

@Injectable()
export class HistoryProviderService {
  private readonly logger = new Logger(HistoryProviderService.name);

  constructor(
    @Inject(forwardRef(() => IntegrationConfigService))
    private readonly integrationConfig: IntegrationConfigService,
  ) {}

  /**
   * Отримати history report від провайдера
   * Автоматично обирає провайдера на основі налаштувань адмінки
   */
  async fetchReport(vin: string): Promise<HistoryReportResult> {
    this.logger.log(`[Provider] Fetching history for ${vin}`);

    // Try CarVertical first (Europe/Bulgaria focus)
    const carVerticalConfig = await this.integrationConfig.getConfig(IntegrationProvider.CAR_VERTICAL);
    if (carVerticalConfig?.isEnabled && carVerticalConfig.credentials?.apiKey) {
      try {
        return await this.fetchFromCarVertical(vin, carVerticalConfig.credentials as { apiKey: string });
      } catch (error: any) {
        this.logger.warn(`CarVertical API error: ${error.message}`);
      }
    }

    // Fallback to Carfax (US)
    const carfaxConfig = await this.integrationConfig.getConfig(IntegrationProvider.CARFAX);
    if (carfaxConfig?.isEnabled && carfaxConfig.credentials?.apiKey) {
      try {
        return await this.fetchFromCarfax(vin, carfaxConfig.credentials as { apiKey: string; accountId?: string });
      } catch (error: any) {
        this.logger.warn(`Carfax API error: ${error.message}`);
      }
    }

    // No provider configured - return mock for development
    this.logger.warn(`No history provider configured - returning mock data`);
    return this.getMockReport(vin);
  }

  /**
   * CarVertical API Integration
   */
  private async fetchFromCarVertical(
    vin: string,
    credentials: { apiKey: string }
  ): Promise<HistoryReportResult> {
    const response = await axios.get(
      `${CARVERTICAL_API_URL}/reports/${vin}`,
      {
        headers: {
          'Authorization': `Bearer ${credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const data = response.data;

    return {
      vin,
      provider: 'carvertical',
      rawData: data,
      normalizedData: {
        vin,
        accidentHistory: data.damages?.map((d: any) => d.description) || [],
        ownersCount: data.ownership?.ownersCount || 0,
        titleIssues: data.title?.issues || [],
        odometerFlags: data.mileage?.flags || [],
        auctionHistory: data.auctions || [],
        damageHistory: data.damages?.map((d: any) => `${d.date}: ${d.description}`) || [],
        serviceRecords: data.serviceHistory || [],
        historyScore: data.score?.value,
      },
      cost: data.report?.cost || 15, // CarVertical standard price
    };
  }

  /**
   * Carfax API Integration
   */
  private async fetchFromCarfax(
    vin: string,
    credentials: { apiKey: string; accountId?: string }
  ): Promise<HistoryReportResult> {
    const response = await axios.post(
      `${CARFAX_API_URL}/reports`,
      { vin },
      {
        headers: {
          'X-API-Key': credentials.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const data = response.data;

    return {
      vin,
      provider: 'carfax',
      rawData: data,
      normalizedData: {
        vin,
        accidentHistory: data.accidentRecords?.map((a: any) => a.description) || [],
        ownersCount: data.ownerHistory?.count || 0,
        titleIssues: data.titleHistory?.issues || [],
        odometerFlags: data.odometerHistory?.flags || [],
        auctionHistory: data.auctionRecords || [],
        damageHistory: data.damageRecords?.map((d: any) => `${d.date}: ${d.description}`) || [],
        serviceRecords: data.serviceHistory || [],
        historyScore: data.carfaxScore,
      },
      cost: data.reportCost || 40, // Carfax standard price
    };
  }

  /**
   * Mock report for development without configured providers
   */
  private getMockReport(vin: string): HistoryReportResult {
    return {
      vin,
      provider: 'mock',
      rawData: {
        vin,
        source: 'mock',
        fetchedAt: new Date().toISOString(),
        notice: 'Configure CarVertical or Carfax API in Admin > Integrations',
      },
      normalizedData: {
        vin,
        accidentHistory: [],
        ownersCount: 0,
        titleIssues: [],
        odometerFlags: [],
        auctionHistory: [],
        damageHistory: [],
        serviceRecords: [],
        historyScore: undefined,
      },
      cost: 0,
    };
  }

  /**
   * Перевірка доступності провайдерів
   */
  async healthCheck(): Promise<{ available: boolean; provider: string; providers: string[] }> {
    const availableProviders: string[] = [];

    const carVerticalConfig = await this.integrationConfig.getConfig(IntegrationProvider.CAR_VERTICAL);
    if (carVerticalConfig?.isEnabled && carVerticalConfig.credentials?.apiKey) {
      availableProviders.push('carvertical');
    }

    const carfaxConfig = await this.integrationConfig.getConfig(IntegrationProvider.CARFAX);
    if (carfaxConfig?.isEnabled && carfaxConfig.credentials?.apiKey) {
      availableProviders.push('carfax');
    }

    return {
      available: availableProviders.length > 0,
      provider: availableProviders[0] || 'none',
      providers: availableProviders,
    };
  }
}
