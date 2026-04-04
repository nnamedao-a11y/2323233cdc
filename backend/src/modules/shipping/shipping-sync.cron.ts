/**
 * Shipping Sync CRON
 * 
 * Auto-tracking для контейнерів:
 * - Polling shipping provider API кожні 15 хвилин
 * - ETA change detection
 * - Stalled shipment detection (no updates > 48h)
 * - Customer timeline updates
 */

import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Shipment, ShipmentStatus, TrackingMode } from './shipment.schema';
import { ShipmentEvent, ShipmentEventSource } from './shipment-event.schema';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';
import { CriticalAlertService } from '../alerts/critical-alert.service';
import { generateId } from '../../shared/utils';
import axios from 'axios';

interface ShippingProviderConfig {
  provider: 'manual' | 'marinetraffic' | 'shipsgo' | 'searates';
  apiKey?: string;
  pollingEnabled: boolean;
  pollingIntervalMinutes: number;
}

interface ContainerTrackingData {
  containerNumber: string;
  status?: string;
  currentPort?: string;
  eta?: Date;
  lastUpdate?: Date;
  events?: Array<{
    timestamp: Date;
    location: string;
    description: string;
  }>;
}

@Injectable()
export class ShippingSyncCron implements OnModuleInit {
  private readonly logger = new Logger(ShippingSyncCron.name);
  private config: ShippingProviderConfig | null = null;

  constructor(
    @InjectModel(Shipment.name) private shipmentModel: Model<Shipment>,
    @InjectModel(ShipmentEvent.name) private eventModel: Model<ShipmentEvent>,
    @Inject(forwardRef(() => IntegrationConfigService))
    private readonly integrationConfig: IntegrationConfigService,
    @Inject(forwardRef(() => CriticalAlertService))
    private readonly alertService: CriticalAlertService,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
  }

  /**
   * Load config from IntegrationConfig
   */
  private async loadConfig(): Promise<void> {
    try {
      const credentials = await this.integrationConfig.getCredentials(IntegrationProvider.SHIPPING);
      if (credentials) {
        const provider = credentials.provider as ShippingProviderConfig['provider'] || 'manual';
        this.config = {
          provider,
          apiKey: credentials.apiKey || undefined,
          pollingEnabled: Boolean(credentials.pollingEnabled),
          pollingIntervalMinutes: Number(credentials.pollingIntervalMinutes) || 15,
        };
        this.logger.log(`Shipping config loaded: ${this.config.provider}, polling: ${this.config.pollingEnabled}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to load shipping config: ${error.message}`);
    }
  }

  async refreshConfig(): Promise<void> {
    await this.loadConfig();
  }

  /**
   * Sync shipments from provider (every 15 minutes)
   */
  @Cron('*/15 * * * *')
  async syncShipments(): Promise<void> {
    if (!this.config?.pollingEnabled || this.config.provider === 'manual') {
      return;
    }

    try {
      const shipments = await this.shipmentModel.find({
        trackingMode: { $in: [TrackingMode.HYBRID, TrackingMode.API] },
        currentStatus: {
          $in: [
            ShipmentStatus.TRANSPORT_TO_PORT,
            ShipmentStatus.AT_ORIGIN_PORT,
            ShipmentStatus.LOADED_ON_VESSEL,
            ShipmentStatus.IN_TRANSIT,
            ShipmentStatus.AT_DESTINATION_PORT,
          ],
        },
        containerNumber: { $exists: true, $ne: null },
      });

      this.logger.log(`Syncing ${shipments.length} active shipments`);

      for (const shipment of shipments) {
        await this.syncShipment(shipment);
      }
    } catch (error) {
      this.logger.error(`Shipment sync failed: ${error.message}`);
    }
  }

  /**
   * Sync individual shipment
   */
  private async syncShipment(shipment: any): Promise<void> {
    try {
      const trackingData = await this.fetchTrackingData(shipment.containerNumber);
      if (!trackingData) return;

      // Check for ETA change
      if (trackingData.eta && shipment.eta) {
        const shipmentEta = shipment.eta;
        const oldEta = shipmentEta ? new Date(shipmentEta).toISOString().split('T')[0] : '';
        const newEta = new Date(trackingData.eta).toISOString().split('T')[0];

        if (oldEta && oldEta !== newEta) {
          await this.alertService.etaChanged(
            shipment.id,
            oldEta,
            newEta,
            shipment.containerNumber || 'N/A',
          );
        }
      }

      // Update shipment
      const updateData: any = {
        lastProviderSync: new Date(),
      };
      
      if (trackingData.eta) updateData.eta = trackingData.eta;
      if (trackingData.currentPort) updateData.currentPort = trackingData.currentPort;

      await this.shipmentModel.updateOne(
        { _id: shipment._id },
        { $set: updateData },
      );

      // Add events if any new
      if (trackingData.events) {
        for (const event of trackingData.events) {
          await this.addProviderEvent(shipment, event);
        }
      }

      this.logger.debug(`Synced shipment ${shipment.id}`);
    } catch (error) {
      this.logger.warn(`Failed to sync shipment ${shipment.id}: ${error.message}`);
    }
  }

  /**
   * Fetch tracking data from provider
   */
  private async fetchTrackingData(containerNumber: string): Promise<ContainerTrackingData | null> {
    if (!this.config?.apiKey || this.config.provider === 'manual') {
      return null;
    }

    // TODO: Implement actual provider APIs
    // For now, return null (manual mode)
    // MarineTraffic, ShipsGo, Searates would be implemented here

    switch (this.config.provider) {
      case 'marinetraffic':
        return this.fetchMarineTraffic(containerNumber);
      case 'shipsgo':
        return this.fetchShipsGo(containerNumber);
      case 'searates':
        return this.fetchSearates(containerNumber);
      default:
        return null;
    }
  }

  private async fetchMarineTraffic(containerNumber: string): Promise<ContainerTrackingData | null> {
    // MarineTraffic API integration would go here
    this.logger.debug(`MarineTraffic: Would fetch ${containerNumber}`);
    return null;
  }

  private async fetchShipsGo(containerNumber: string): Promise<ContainerTrackingData | null> {
    // ShipsGo API integration would go here
    this.logger.debug(`ShipsGo: Would fetch ${containerNumber}`);
    return null;
  }

  private async fetchSearates(containerNumber: string): Promise<ContainerTrackingData | null> {
    // Searates API integration would go here
    this.logger.debug(`Searates: Would fetch ${containerNumber}`);
    return null;
  }

  /**
   * Add provider event
   */
  private async addProviderEvent(shipment: any, event: any): Promise<void> {
    const existing = await this.eventModel.findOne({
      shipmentId: shipment.id,
      timestamp: event.timestamp,
      location: event.location,
    });

    if (existing) return;

    await this.eventModel.create({
      id: generateId(),
      shipmentId: shipment.id,
      eventType: 'tracking_update',
      timestamp: event.timestamp,
      location: event.location,
      description: event.description,
      source: ShipmentEventSource.PROVIDER,
      rawData: event,
    });
  }

  /**
   * Detect stalled shipments (no updates > 48h)
   * Runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async detectStalledShipments(): Promise<void> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

    const stalledShipments = await this.shipmentModel.find({
      currentStatus: {
        $in: [
          ShipmentStatus.TRANSPORT_TO_PORT,
          ShipmentStatus.AT_ORIGIN_PORT,
          ShipmentStatus.LOADED_ON_VESSEL,
          ShipmentStatus.IN_TRANSIT,
        ],
      },
      updatedAt: { $lt: cutoff },
    });

    for (const shipment of stalledShipments) {
      const lastUpdate = shipment.updatedAt;
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24),
      );

      await this.alertService.shipmentStalled(
        shipment.id,
        shipment.containerNumber || 'N/A',
        daysSinceUpdate,
      );

      // Mark as alerted to avoid spam (using metadata)
      await this.shipmentModel.updateOne(
        { _id: shipment._id },
        { $set: { 'metadata.stallAlertSentAt': new Date() } },
      );
    }

    if (stalledShipments.length > 0) {
      this.logger.warn(`Found ${stalledShipments.length} stalled shipments`);
    }
  }

  /**
   * Get sync statistics
   */
  async getStats(): Promise<{
    totalActive: number;
    autoTracking: number;
    stalled: number;
    lastSync: Date | null;
  }> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const [totalActive, autoTracking, stalled] = await Promise.all([
      this.shipmentModel.countDocuments({
        currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
      }),
      this.shipmentModel.countDocuments({
        trackingMode: { $in: [TrackingMode.HYBRID, TrackingMode.API] },
      }),
      this.shipmentModel.countDocuments({
        currentStatus: {
          $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED, ShipmentStatus.READY_FOR_PICKUP],
        },
        updatedAt: { $lt: cutoff },
      }),
    ]);

    return {
      totalActive,
      autoTracking,
      stalled,
      lastSync: null, // Would query for actual last sync
    };
  }
}
