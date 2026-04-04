/**
 * Shipping Tracking Service
 * 
 * Автоматичне відстеження контейнерів через SeaRates/ShipsGo
 * 
 * Features:
 * - Enable/disable tracking per shipment
 * - Auto-sync every 15 minutes (CRON)
 * - Status change detection + alerts
 * - ETA change detection + alerts
 * - Stalled shipment detection (24h no update)
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { Shipment, ShipmentStatus, TrackingMode } from './shipment.schema';
import { SeaRatesProvider, TrackingResult } from './providers/searates.provider';
import { AlertsService } from '../alerts/alerts.service';
import { AlertEventType } from '../alerts/alert-event.schema';
import { CustomerNotificationService } from '../notifications/customer-notification.service';
import { generateId, toObjectResponse } from '../../shared/utils';

@Injectable()
export class ShippingTrackingService {
  private readonly logger = new Logger(ShippingTrackingService.name);

  constructor(
    @InjectModel(Shipment.name) private shipmentModel: Model<Shipment>,
    private readonly seaRatesProvider: SeaRatesProvider,
    private readonly alertsService: AlertsService,
    @Inject(forwardRef(() => CustomerNotificationService))
    private readonly customerNotificationService: CustomerNotificationService,
  ) {}

  /**
   * Enable tracking for a shipment
   * Requires at least one tracking identifier
   */
  async enableTracking(shipmentId: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    
    if (!shipment) {
      throw new Error('Shipment not found');
    }

    // Check for tracking identifiers
    if (!shipment.containerNumber && !shipment.billOfLading && !shipment.bookingNumber) {
      throw new Error('No tracking identifier provided (container, B/L, or booking number required)');
    }

    // Enable tracking
    shipment.trackingActive = true;
    shipment.trackingMode = TrackingMode.API;
    shipment.trackingProvider = 'searates';
    shipment.lastSyncStatus = 'pending';
    
    await shipment.save();

    // Do initial sync
    await this.syncShipment(shipmentId);

    return toObjectResponse(shipment);
  }

  /**
   * Disable tracking for a shipment
   */
  async disableTracking(shipmentId: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    
    if (!shipment) {
      throw new Error('Shipment not found');
    }

    shipment.trackingActive = false;
    shipment.trackingMode = TrackingMode.MANUAL;
    
    await shipment.save();

    return toObjectResponse(shipment);
  }

  /**
   * Update tracking fields for a shipment
   */
  async updateTrackingFields(shipmentId: string, dto: {
    containerNumber?: string;
    billOfLading?: string;
    bookingNumber?: string;
    carrier?: string;
    vesselName?: string;
    originPort?: string;
    destinationPort?: string;
  }): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    
    if (!shipment) {
      throw new Error('Shipment not found');
    }

    // Update fields
    if (dto.containerNumber !== undefined) shipment.containerNumber = dto.containerNumber;
    if (dto.billOfLading !== undefined) shipment.billOfLading = dto.billOfLading;
    if (dto.bookingNumber !== undefined) shipment.bookingNumber = dto.bookingNumber;
    if (dto.carrier !== undefined) shipment.carrier = dto.carrier;
    if (dto.vesselName !== undefined) shipment.vesselName = dto.vesselName;
    if (dto.originPort !== undefined) shipment.originPort = dto.originPort;
    if (dto.destinationPort !== undefined) shipment.destinationPort = dto.destinationPort;
    
    await shipment.save();

    return toObjectResponse(shipment);
  }

  /**
   * Sync single shipment with tracking provider
   */
  async syncShipment(shipmentId: string): Promise<void> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    
    if (!shipment || !shipment.trackingActive) {
      return;
    }

    try {
      let raw: any;
      let trackingResult: TrackingResult;

      // Try tracking methods in order of preference
      if (shipment.containerNumber) {
        raw = await this.seaRatesProvider.trackByContainer({
          containerNumber: shipment.containerNumber,
          carrier: shipment.carrier,
        });
      } else if (shipment.billOfLading) {
        raw = await this.seaRatesProvider.trackByBL({
          billOfLading: shipment.billOfLading,
          carrier: shipment.carrier,
        });
      } else if (shipment.bookingNumber) {
        raw = await this.seaRatesProvider.trackByBooking({
          bookingNumber: shipment.bookingNumber,
          carrier: shipment.carrier,
        });
      } else {
        throw new Error('No tracking identifier');
      }

      trackingResult = this.seaRatesProvider.normalize(raw);

      // Save old values for comparison
      const oldStatus = shipment.currentStatus;
      const oldEta = shipment.eta?.toISOString() || null;

      // Update shipment with new data
      if (trackingResult.status) {
        const mappedStatus = this.mapProviderStatus(trackingResult.status);
        if (mappedStatus) {
          shipment.currentStatus = mappedStatus;
        }
      }
      if (trackingResult.eta) {
        shipment.eta = trackingResult.eta;
      }
      if (trackingResult.vesselName) {
        shipment.vesselName = trackingResult.vesselName;
      }
      if (trackingResult.vesselImo) {
        shipment.vesselImo = trackingResult.vesselImo;
      }
      if (trackingResult.currentPort) {
        shipment.currentPort = trackingResult.currentPort;
      }
      if (trackingResult.currentLocation) {
        shipment.currentLocation = trackingResult.currentLocation;
      }
      if (trackingResult.destinationPort) {
        shipment.destinationPort = trackingResult.destinationPort;
      }
      if (trackingResult.originPort) {
        shipment.originPort = trackingResult.originPort;
      }
      if (trackingResult.carrier) {
        shipment.carrier = trackingResult.carrier;
      }

      // Add new events to timeline
      for (const event of trackingResult.events) {
        const exists = shipment.events.some(
          e => e.status === event.eventType && 
               e.timestamp?.toISOString() === event.eventDate?.toISOString()
        );
        
        if (!exists) {
          shipment.events.push({
            status: event.eventType,
            location: event.location || '',
            description: event.title,
            timestamp: event.eventDate,
          });
        }
      }

      // Update sync metadata
      shipment.lastSyncAt = new Date();
      shipment.lastSyncStatus = 'ok';
      shipment.lastSyncError = '';

      await shipment.save();

      // Emit alerts for status changes
      if (oldStatus !== shipment.currentStatus) {
        await this.alertsService.sendAlert({
          eventType: AlertEventType.SHIPMENT_STATUS_CHANGED,
          metadata: {
            shipmentId: shipment.id,
            oldStatus,
            newStatus: shipment.currentStatus,
            vin: shipment.vin,
          },
        });

        // Send real-time notification to customer
        await this.customerNotificationService.notifyShipmentStatusChanged({
          userId: shipment.userId,
          customerId: shipment.customerId,
          shipmentId: shipment.id,
          vin: shipment.vin,
          vehicleTitle: shipment.vehicleTitle,
          oldStatus,
          newStatus: shipment.currentStatus,
        });
      }

      // Emit alerts for ETA changes
      const newEta = shipment.eta?.toISOString() || null;
      if (oldEta !== newEta) {
        await this.alertsService.sendAlert({
          eventType: AlertEventType.SHIPMENT_ETA_CHANGED,
          metadata: {
            shipmentId: shipment.id,
            oldEta,
            newEta,
            vin: shipment.vin,
          },
        });

        // Send real-time notification to customer
        await this.customerNotificationService.notifyEtaChanged({
          userId: shipment.userId,
          customerId: shipment.customerId,
          shipmentId: shipment.id,
          vin: shipment.vin,
          vehicleTitle: shipment.vehicleTitle,
          oldEta,
          newEta,
        });
      }

      this.logger.log(`Synced shipment ${shipmentId}: status=${shipment.currentStatus}, eta=${newEta}`);
    } catch (error: any) {
      // Update with error status
      shipment.lastSyncAt = new Date();
      shipment.lastSyncStatus = 'fail';
      shipment.lastSyncError = error.message;
      await shipment.save();

      // Emit alert for sync failure
      await this.alertsService.sendAlert({
        eventType: AlertEventType.SHIPMENT_SYNC_FAILED,
        metadata: {
          shipmentId: shipment.id,
          error: error.message,
          vin: shipment.vin,
        },
      });

      this.logger.error(`Failed to sync shipment ${shipmentId}: ${error.message}`);
    }
  }

  /**
   * CRON: Sync all active trackings every 15 minutes
   */
  @Cron('*/15 * * * *')
  async syncAllShipments(): Promise<void> {
    this.logger.log('Starting shipment tracking sync...');

    const activeShipments = await this.shipmentModel.find({
      trackingActive: true,
    });

    this.logger.log(`Found ${activeShipments.length} active shipments to sync`);

    for (const shipment of activeShipments) {
      try {
        await this.syncShipment(shipment.id);
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        this.logger.error(`Sync failed for ${shipment.id}: ${error.message}`);
      }
    }

    this.logger.log('Shipment tracking sync completed');
  }

  /**
   * CRON: Detect stalled shipments (no sync for 24h)
   */
  @Cron('0 * * * *') // Every hour
  async detectStalledShipments(): Promise<void> {
    const stalledThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const stalledShipments = await this.shipmentModel.find({
      trackingActive: true,
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
      $or: [
        { lastSyncAt: { $lt: stalledThreshold } },
        { lastSyncAt: null },
      ],
    });

    for (const shipment of stalledShipments) {
      await this.alertsService.sendAlert({
        eventType: AlertEventType.SHIPMENT_STALLED,
        metadata: {
          shipmentId: shipment.id,
          vin: shipment.vin,
          lastSyncAt: shipment.lastSyncAt,
        },
      });
    }

    if (stalledShipments.length > 0) {
      this.logger.warn(`Found ${stalledShipments.length} stalled shipments`);
    }
  }

  /**
   * Get shipments without tracking data (for task creation)
   */
  async getShipmentsWithoutTracking(olderThanHours: number = 24): Promise<any[]> {
    const threshold = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    
    const shipments = await this.shipmentModel.find({
      trackingActive: false,
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
      $and: [
        { $or: [{ containerNumber: null }, { containerNumber: '' }] },
        { $or: [{ billOfLading: null }, { billOfLading: '' }] },
        { $or: [{ bookingNumber: null }, { bookingNumber: '' }] },
      ],
      createdAt: { $lt: threshold },
    });

    return shipments.map(s => toObjectResponse(s));
  }

  /**
   * Get tracking statistics
   */
  async getTrackingStats(): Promise<any> {
    const total = await this.shipmentModel.countDocuments({
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
    });

    const active = await this.shipmentModel.countDocuments({
      trackingActive: true,
    });

    const withContainer = await this.shipmentModel.countDocuments({
      containerNumber: { $nin: [null, ''] },
    });

    const stalledCount = await this.shipmentModel.countDocuments({
      trackingActive: true,
      lastSyncStatus: 'fail',
    });

    const noTracking = await this.shipmentModel.countDocuments({
      trackingActive: false,
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
      containerNumber: { $in: [null, ''] },
    });

    return {
      total,
      activeTracking: active,
      withContainer,
      stalled: stalledCount,
      missingTracking: noTracking,
    };
  }

  /**
   * Map provider status to internal ShipmentStatus enum
   */
  private mapProviderStatus(status: string): ShipmentStatus | null {
    const map: Record<string, ShipmentStatus> = {
      'transport_to_port': ShipmentStatus.TRANSPORT_TO_PORT,
      'at_origin_port': ShipmentStatus.AT_ORIGIN_PORT,
      'loaded_on_vessel': ShipmentStatus.LOADED_ON_VESSEL,
      'in_transit': ShipmentStatus.IN_TRANSIT,
      'at_destination_port': ShipmentStatus.AT_DESTINATION_PORT,
      'customs': ShipmentStatus.CUSTOMS,
      'ready_for_pickup': ShipmentStatus.READY_FOR_PICKUP,
      'delivered': ShipmentStatus.DELIVERED,
    };
    
    return map[status] || null;
  }
}
