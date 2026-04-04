/**
 * Shipping Tracker Service
 * 
 * Auto-tracking контейнерів через API провайдерів
 * Підтримувані провайдери: manual, marinetraffic, shipsgo, searates
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Shipment, ShipmentStatus } from '../shipping/shipment.schema';
import { ShipmentEvent, ShipmentEventSource } from '../shipping/shipment-event.schema';
import { IntegrationConfigService } from '../integration-config/integration-config.service';
import { IntegrationProvider } from '../integration-config/schemas/integration-config.schema';
import { SystemErrorService } from '../system-errors/system-error.service';
import { CustomerNotificationService } from '../notifications/customer-notification.service';
import axios from 'axios';

export interface ContainerTrackingData {
  containerNumber: string;
  currentPort?: string;
  currentLocation?: string;
  eta?: Date;
  vesselName?: string;
  vesselImo?: string;
  status?: string;
  events?: Array<{
    date: Date;
    location: string;
    description: string;
    eventCode?: string;
  }>;
}

export interface ShippingProviderAdapter {
  getContainerInfo(containerNumber: string): Promise<ContainerTrackingData | null>;
  getVesselInfo(vesselNameOrImo: string): Promise<any>;
}

@Injectable()
export class ShippingTrackerService {
  private readonly logger = new Logger(ShippingTrackerService.name);
  private adapters: Map<string, ShippingProviderAdapter> = new Map();

  constructor(
    @InjectModel(Shipment.name) private shipmentModel: Model<Shipment>,
    @InjectModel(ShipmentEvent.name) private eventModel: Model<ShipmentEvent>,
    private readonly integrationConfig: IntegrationConfigService,
    private readonly errorService: SystemErrorService,
    @Inject(forwardRef(() => CustomerNotificationService))
    private readonly customerNotifications: CustomerNotificationService,
  ) {
    this.initializeAdapters();
  }

  /**
   * Initialize provider adapters
   */
  private initializeAdapters(): void {
    // MarineTraffic adapter
    this.adapters.set('marinetraffic', {
      getContainerInfo: async (containerNumber: string) => {
        const credentials = await this.integrationConfig.getCredentials(IntegrationProvider.SHIPPING);
        if (!credentials?.apiKey) return null;

        try {
          // MarineTraffic Container Tracking API
          const response = await axios.get(
            `https://services.marinetraffic.com/api/container/${containerNumber}`,
            { params: { apikey: credentials.apiKey } },
          );
          return this.normalizeMarineTrafficResponse(response.data);
        } catch (error) {
          this.logger.warn(`MarineTraffic error: ${error.message}`);
          return null;
        }
      },
      getVesselInfo: async (vesselNameOrImo: string) => null,
    });

    // ShipsGo adapter
    this.adapters.set('shipsgo', {
      getContainerInfo: async (containerNumber: string) => {
        const credentials = await this.integrationConfig.getCredentials(IntegrationProvider.SHIPPING);
        if (!credentials?.apiKey) return null;

        try {
          const response = await axios.get(
            `https://shipsgo.com/api/v1.0/ContainerService/GetContainerInfo`,
            {
              params: { containerNumber },
              headers: { 'Authorization': `Bearer ${credentials.apiKey}` },
            },
          );
          return this.normalizeShipsGoResponse(response.data);
        } catch (error) {
          this.logger.warn(`ShipsGo error: ${error.message}`);
          return null;
        }
      },
      getVesselInfo: async (vesselNameOrImo: string) => null,
    });

    // Searates adapter
    this.adapters.set('searates', {
      getContainerInfo: async (containerNumber: string) => {
        const credentials = await this.integrationConfig.getCredentials(IntegrationProvider.SHIPPING);
        if (!credentials?.apiKey) return null;

        try {
          const response = await axios.get(
            `https://www.searates.com/api/v1/containers/${containerNumber}`,
            { headers: { 'X-API-KEY': credentials.apiKey } },
          );
          return this.normalizeSearatesResponse(response.data);
        } catch (error) {
          this.logger.warn(`Searates error: ${error.message}`);
          return null;
        }
      },
      getVesselInfo: async (vesselNameOrImo: string) => null,
    });

    this.logger.log('Shipping adapters initialized');
  }

  /**
   * Auto-sync shipments (CRON)
   * Runs based on configured polling interval
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async autoSyncShipments(): Promise<void> {
    const config = await this.integrationConfig.getConfig(IntegrationProvider.SHIPPING);
    if (!config?.isEnabled || config.settings?.provider === 'manual') {
      return;
    }

    if (!config.settings?.autoTrackingEnabled) {
      return;
    }

    const providerName = config.settings.provider || 'manual';
    const adapter = this.adapters.get(providerName);
    if (!adapter) {
      this.logger.warn(`No adapter for provider: ${providerName}`);
      return;
    }

    // Find active shipments that need tracking
    const shipments = await this.shipmentModel.find({
      trackingActive: true,
      containerNumber: { $exists: true, $ne: null },
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
    }).limit(50);

    this.logger.log(`Auto-syncing ${shipments.length} shipments with ${providerName}`);

    for (const shipment of shipments) {
      await this.syncShipment(shipment, adapter);
    }
  }

  /**
   * Sync single shipment
   */
  async syncShipment(shipment: any, adapter?: ShippingProviderAdapter): Promise<boolean> {
    if (!shipment.containerNumber) {
      return false;
    }

    if (!adapter) {
      const config = await this.integrationConfig.getConfig(IntegrationProvider.SHIPPING);
      const providerName = config?.settings?.provider || 'manual';
      adapter = this.adapters.get(providerName);
      if (!adapter) return false;
    }

    try {
      const trackingData = await adapter.getContainerInfo(shipment.containerNumber);
      if (!trackingData) {
        return false;
      }

      // Check for changes
      const changes: string[] = [];
      const oldStatus = shipment.currentStatus;
      const oldEta = shipment.eta;

      if (trackingData.eta && shipment.eta) {
        const newEta = new Date(trackingData.eta);
        const oldEtaDate = new Date(shipment.eta);
        if (Math.abs(newEta.getTime() - oldEtaDate.getTime()) > 24 * 60 * 60 * 1000) {
          changes.push(`ETA changed: ${oldEtaDate.toDateString()} → ${newEta.toDateString()}`);
        }
      }

      if (trackingData.currentPort && trackingData.currentPort !== shipment.currentPort) {
        changes.push(`Port changed: ${shipment.currentPort} → ${trackingData.currentPort}`);
      }

      // Update shipment
      const updateData: any = {
        lastExternalSyncAt: new Date(),
      };

      if (trackingData.currentPort) updateData.currentPort = trackingData.currentPort;
      if (trackingData.currentLocation) updateData.currentLocation = trackingData.currentLocation;
      if (trackingData.eta) updateData.eta = trackingData.eta;
      if (trackingData.vesselName) updateData.vesselName = trackingData.vesselName;
      if (trackingData.vesselImo) updateData.vesselImo = trackingData.vesselImo;

      // Detect status change
      let newStatus: ShipmentStatus | null = null;
      if (trackingData.status) {
        newStatus = this.mapProviderStatusToInternal(trackingData.status);
        if (newStatus && newStatus !== shipment.currentStatus) {
          updateData.currentStatus = newStatus;
          changes.push(`Status: ${shipment.currentStatus} → ${newStatus}`);
        }
      }

      await this.shipmentModel.updateOne({ _id: shipment._id }, updateData);

      // Add events from provider
      if (trackingData.events?.length) {
        for (const event of trackingData.events) {
          await this.addEventIfNew(shipment.id, event);
        }
      }

      // === REAL-TIME NOTIFICATIONS ===
      // Send notifications if there are changes
      if (changes.length > 0 && shipment.userId) {
        // Status changed notification
        if (newStatus && newStatus !== oldStatus) {
          await this.customerNotifications.notifyShipmentStatusChanged({
            userId: shipment.userId,
            customerId: shipment.customerId,
            shipmentId: shipment.id,
            vin: shipment.vin,
            vehicleTitle: shipment.vehicleTitle,
            oldStatus,
            newStatus,
          });
        }

        // ETA changed notification
        if (trackingData.eta && oldEta) {
          const etaChanged = Math.abs(new Date(trackingData.eta).getTime() - new Date(oldEta).getTime()) > 24 * 60 * 60 * 1000;
          if (etaChanged) {
            await this.customerNotifications.notifyEtaChanged({
              userId: shipment.userId,
              customerId: shipment.customerId,
              shipmentId: shipment.id,
              vin: shipment.vin,
              vehicleTitle: shipment.vehicleTitle,
              oldEta: oldEta?.toISOString(),
              newEta: trackingData.eta?.toISOString(),
            });
          }
        }
      }

      this.logger.log(`Synced shipment ${shipment.id}: ${changes.length} changes`);
      return true;
    } catch (error) {
      await this.errorService.logError({
        module: 'ShippingTracker',
        action: 'syncShipment',
        error: error.message,
        context: { shipmentId: shipment.id, containerNumber: shipment.containerNumber },
      });
      return false;
    }
  }

  /**
   * Detect stalled shipments (CRON)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async detectStalledShipments(): Promise<void> {
    // Find shipments with no updates in 48+ hours
    const stalledThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const stalledShipments = await this.shipmentModel.find({
      trackingActive: true,
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED, ShipmentStatus.AT_DESTINATION_PORT] },
      $or: [
        { lastExternalSyncAt: { $lt: stalledThreshold } },
        { lastExternalSyncAt: { $exists: false }, updatedAt: { $lt: stalledThreshold } },
      ],
    });

    for (const shipment of stalledShipments) {
      await this.errorService.logError({
        module: 'ShippingTracker',
        action: 'stalledShipment',
        error: `Shipment ${shipment.id} has no updates for 48+ hours`,
        context: {
          shipmentId: shipment.id,
          containerNumber: shipment.containerNumber,
          lastStatus: shipment.currentStatus,
          dealId: shipment.dealId,
        },
      });

      // Send alert to manager
      if (shipment.managerId) {
        // Log stall alert - notification via existing alert system
        this.logger.warn(`Stalled shipment detected: ${shipment.id}, manager: ${shipment.managerId}`);
      }
    }

    if (stalledShipments.length > 0) {
      this.logger.warn(`Detected ${stalledShipments.length} stalled shipments`);
    }
  }

  /**
   * Manual sync trigger
   */
  async manualSync(shipmentId: string): Promise<ContainerTrackingData | null> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    if (!shipment) return null;

    const config = await this.integrationConfig.getConfig(IntegrationProvider.SHIPPING);
    const providerName = config?.settings?.provider || 'manual';
    const adapter = this.adapters.get(providerName);

    if (!adapter || !shipment.containerNumber) {
      return null;
    }

    const data = await adapter.getContainerInfo(shipment.containerNumber);
    if (data) {
      await this.syncShipment(shipment, adapter);
    }
    return data;
  }

  // ==================== HELPERS ====================

  private normalizeMarineTrafficResponse(data: any): ContainerTrackingData | null {
    if (!data) return null;
    return {
      containerNumber: data.container_number,
      currentPort: data.current_port,
      eta: data.eta ? new Date(data.eta) : undefined,
      vesselName: data.vessel_name,
      vesselImo: data.vessel_imo,
      status: data.status,
      events: data.events?.map((e: any) => ({
        date: new Date(e.date),
        location: e.location,
        description: e.description,
      })),
    };
  }

  private normalizeShipsGoResponse(data: any): ContainerTrackingData | null {
    if (!data) return null;
    return {
      containerNumber: data.ContainerNumber,
      currentPort: data.LastPort,
      eta: data.ETA ? new Date(data.ETA) : undefined,
      vesselName: data.VesselName,
      status: data.Status,
      events: data.Events?.map((e: any) => ({
        date: new Date(e.EventDate),
        location: e.Location,
        description: e.Description,
      })),
    };
  }

  private normalizeSearatesResponse(data: any): ContainerTrackingData | null {
    if (!data) return null;
    return {
      containerNumber: data.container_number,
      currentPort: data.location?.port,
      eta: data.eta ? new Date(data.eta) : undefined,
      vesselName: data.vessel?.name,
      status: data.status,
    };
  }

  private mapProviderStatusToInternal(providerStatus: string): ShipmentStatus | null {
    const mapping: Record<string, ShipmentStatus> = {
      'loaded': ShipmentStatus.LOADED_ON_VESSEL,
      'in_transit': ShipmentStatus.IN_TRANSIT,
      'arrived': ShipmentStatus.AT_DESTINATION_PORT,
      'discharged': ShipmentStatus.AT_DESTINATION_PORT,
      'customs': ShipmentStatus.CUSTOMS,
      'delivered': ShipmentStatus.DELIVERED,
    };
    return mapping[providerStatus.toLowerCase()] || null;
  }

  private async addEventIfNew(shipmentId: string, event: any): Promise<void> {
    const existing = await this.eventModel.findOne({
      shipmentId,
      eventDate: event.date,
      title: event.description,
    });

    if (!existing) {
      await this.eventModel.create({
        shipmentId,
        eventType: 'provider_update',
        title: event.description,
        location: event.location,
        eventDate: event.date,
        source: ShipmentEventSource.PROVIDER,
      });
    }
  }

  private async notifyEtaChange(shipment: any, changes: string[]): Promise<void> {
    // TODO: Send notification to customer and manager
    this.logger.log(`ETA/Status changes for shipment ${shipment.id}: ${changes.join(', ')}`);
  }

  /**
   * Get tracking summary for all active shipments
   */
  async getTrackingSummary(): Promise<{
    totalActive: number;
    stalled: number;
    inTransit: number;
    atPort: number;
    lastSyncAt?: Date;
  }> {
    const [totalActive, stalled, inTransit, atPort] = await Promise.all([
      this.shipmentModel.countDocuments({ trackingActive: true }),
      this.shipmentModel.countDocuments({
        trackingActive: true,
        lastExternalSyncAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      }),
      this.shipmentModel.countDocuments({ currentStatus: ShipmentStatus.IN_TRANSIT }),
      this.shipmentModel.countDocuments({
        currentStatus: { $in: [ShipmentStatus.AT_ORIGIN_PORT, ShipmentStatus.AT_DESTINATION_PORT] },
      }),
    ]);

    const lastSync = await this.shipmentModel.findOne({ lastExternalSyncAt: { $exists: true } })
      .sort({ lastExternalSyncAt: -1 })
      .select('lastExternalSyncAt')
      .lean() as any;

    return {
      totalActive,
      stalled,
      inTransit,
      atPort,
      lastSyncAt: lastSync?.lastExternalSyncAt,
    };
  }
}
