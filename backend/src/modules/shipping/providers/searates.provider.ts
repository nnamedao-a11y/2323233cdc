/**
 * SeaRates Provider
 * 
 * Container tracking via SeaRates API
 * Supports: Container Number, Bill of Lading, Booking Number
 * 
 * API Docs: https://www.searates.com/services/tracking/
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IntegrationConfigService } from '../../integration-config/integration-config.service';
import { IntegrationProvider } from '../../integration-config/schemas/integration-config.schema';

export interface TrackingResult {
  status?: string;
  eta?: Date | null;
  vesselName?: string | null;
  vesselImo?: string | null;
  currentPort?: string | null;
  currentLocation?: string | null;
  destinationPort?: string | null;
  originPort?: string | null;
  carrier?: string | null;
  events: Array<{
    eventType: string;
    title: string;
    description?: string;
    location?: string;
    eventDate: Date;
  }>;
  raw?: any;
}

export interface ShippingTrackingProvider {
  trackByContainer(input: { containerNumber: string; carrier?: string }): Promise<any>;
  trackByBL(input: { billOfLading: string; carrier?: string }): Promise<any>;
  trackByBooking(input: { bookingNumber: string; carrier?: string }): Promise<any>;
  normalize(raw: any): TrackingResult;
  isAvailable(): boolean;
  testConnection(): Promise<{ success: boolean; error?: string }>;
}

@Injectable()
export class SeaRatesProvider implements ShippingTrackingProvider, OnModuleInit {
  private readonly logger = new Logger(SeaRatesProvider.name);
  private isEnabled: boolean = false;
  private apiKey: string | null = null;
  private baseUrl: string = 'https://sirius.searates.com/tracking/v1';

  constructor(
    private readonly integrationConfigService: IntegrationConfigService,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
  }

  /**
   * Load SeaRates config from DB
   */
  private async loadConfig(): Promise<void> {
    try {
      const config = await this.integrationConfigService.getConfig(IntegrationProvider.SEARATES);
      this.isEnabled = config?.isEnabled ?? false;
      
      const credentials = await this.integrationConfigService.getCredentials(IntegrationProvider.SEARATES);
      this.apiKey = credentials?.apiKey || null;
      
      if (credentials?.baseUrl) {
        this.baseUrl = credentials.baseUrl;
      }
      
      this.logger.log(`SeaRates config loaded: enabled=${this.isEnabled}, hasKey=${!!this.apiKey}`);
    } catch (error) {
      this.logger.warn(`SeaRates config not found, using defaults`);
    }
  }

  isAvailable(): boolean {
    return this.isEnabled && !!this.apiKey;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'SeaRates not configured' };
    }
    
    try {
      // Test with a dummy request
      const response = await fetch(`${this.baseUrl}/status`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      return { success: response.ok };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async trackByContainer(input: { containerNumber: string; carrier?: string }): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('SeaRates provider not available');
    }

    const params = new URLSearchParams({
      number: input.containerNumber,
      type: 'CT',
    });

    if (input.carrier) {
      params.set('sealine', input.carrier);
    }

    const url = `${this.baseUrl}/track?${params.toString()}`;
    
    this.logger.log(`Tracking container: ${input.containerNumber}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeaRates API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async trackByBL(input: { billOfLading: string; carrier?: string }): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('SeaRates provider not available');
    }

    const params = new URLSearchParams({
      number: input.billOfLading,
      type: 'BL',
    });

    if (input.carrier) {
      params.set('sealine', input.carrier);
    }

    const url = `${this.baseUrl}/track?${params.toString()}`;
    
    this.logger.log(`Tracking B/L: ${input.billOfLading}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeaRates API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async trackByBooking(input: { bookingNumber: string; carrier?: string }): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('SeaRates provider not available');
    }

    const params = new URLSearchParams({
      number: input.bookingNumber,
      type: 'BK',
    });

    if (input.carrier) {
      params.set('sealine', input.carrier);
    }

    const url = `${this.baseUrl}/track?${params.toString()}`;
    
    this.logger.log(`Tracking booking: ${input.bookingNumber}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeaRates API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Normalize SeaRates response to standard format
   */
  normalize(raw: any): TrackingResult {
    // SeaRates response structure may vary, adapt as needed
    const data = raw?.data || raw;
    
    const result: TrackingResult = {
      status: this.mapStatus(data?.status || data?.current_status),
      eta: data?.eta ? new Date(data.eta) : null,
      vesselName: data?.vessel?.name || data?.vessel_name || null,
      vesselImo: data?.vessel?.imo || data?.vessel_imo || null,
      currentPort: data?.current_port?.name || data?.current_location || null,
      currentLocation: data?.current_location || null,
      destinationPort: data?.destination?.port_name || data?.pod || null,
      originPort: data?.origin?.port_name || data?.pol || null,
      carrier: data?.carrier || data?.shipping_line || null,
      events: [],
      raw,
    };

    // Parse events/milestones
    const events = data?.events || data?.milestones || data?.tracking_events || [];
    if (Array.isArray(events)) {
      result.events = events.map((e: any) => ({
        eventType: e.event_type || e.type || 'tracking_update',
        title: e.description || e.status || e.title || 'Status update',
        description: e.details || e.description,
        location: e.location?.name || e.port || e.location,
        eventDate: e.date ? new Date(e.date) : new Date(),
      }));
    }

    return result;
  }

  /**
   * Map provider status to internal status
   */
  private mapStatus(providerStatus: string): string {
    const statusMap: Record<string, string> = {
      'gate_out': 'transport_to_port',
      'loaded': 'loaded_on_vessel',
      'departed': 'in_transit',
      'in_transit': 'in_transit',
      'at_sea': 'in_transit',
      'arrived': 'at_destination_port',
      'discharged': 'at_destination_port',
      'gate_in': 'at_destination_port',
      'customs': 'customs',
      'delivered': 'delivered',
    };
    
    const normalized = providerStatus?.toLowerCase()?.replace(/\s+/g, '_');
    return statusMap[normalized] || providerStatus || 'unknown';
  }
}
