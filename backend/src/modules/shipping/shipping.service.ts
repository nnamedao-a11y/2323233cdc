/**
 * Shipping Service
 * 
 * Tracks vehicle shipping from purchase to delivery
 * Integrated with PaymentFlowService for step blocking
 */

import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Shipment, ShipmentStatus, TrackingMode } from './shipment.schema';
import { ShipmentEvent, ShipmentEventSource } from './shipment-event.schema';
import { PaymentFlowService } from '../payment-flow/payment-flow.service';
import { DealStep } from '../payment-flow/payment-flow.schema';
import { CustomerNotificationService } from '../notifications/customer-notification.service';
import { generateId, toObjectResponse } from '../../shared/utils';

// Map ShipmentStatus to DealStep for validation
const STATUS_TO_STEP: Record<ShipmentStatus, DealStep> = {
  [ShipmentStatus.DEAL_CREATED]: DealStep.DEAL_CREATED,
  [ShipmentStatus.CONTRACT_SIGNED]: DealStep.CONTRACT_SIGNED,
  [ShipmentStatus.DEPOSIT_PAID]: DealStep.DEPOSIT_PAID,
  [ShipmentStatus.LOT_PAID]: DealStep.LOT_PAID,
  [ShipmentStatus.TRANSPORT_TO_PORT]: DealStep.TRANSPORT_TO_PORT,
  [ShipmentStatus.AT_ORIGIN_PORT]: DealStep.AT_ORIGIN_PORT,
  [ShipmentStatus.LOADED_ON_VESSEL]: DealStep.LOADED_ON_VESSEL,
  [ShipmentStatus.IN_TRANSIT]: DealStep.IN_TRANSIT,
  [ShipmentStatus.AT_DESTINATION_PORT]: DealStep.AT_DESTINATION_PORT,
  [ShipmentStatus.CUSTOMS]: DealStep.CUSTOMS,
  [ShipmentStatus.READY_FOR_PICKUP]: DealStep.READY_FOR_PICKUP,
  [ShipmentStatus.DELIVERED]: DealStep.DELIVERED,
  [ShipmentStatus.CANCELLED]: DealStep.DEAL_CREATED, // Special case
};

// Statuses where tracking should be active
const TRACKING_ACTIVE_STATUSES = [
  ShipmentStatus.TRANSPORT_TO_PORT,
  ShipmentStatus.AT_ORIGIN_PORT,
  ShipmentStatus.LOADED_ON_VESSEL,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.AT_DESTINATION_PORT,
  ShipmentStatus.CUSTOMS,
  ShipmentStatus.READY_FOR_PICKUP,
  ShipmentStatus.DELIVERED,
];

export interface CreateShipmentDto {
  dealId: string;
  userId: string;
  managerId: string;
  vin: string;
  vehicleTitle?: string;
  containerNumber?: string;
  carrier?: string;
  vesselName?: string;
  vesselImo?: string;
  originPort?: string;
  destinationPort?: string;
  eta?: Date;
  trackingMode?: TrackingMode;
}

export interface UpdateShipmentDto {
  containerNumber?: string;
  carrier?: string;
  vesselName?: string;
  vesselImo?: string;
  currentPort?: string;
  destinationPort?: string;
  eta?: Date;
  notes?: string;
}

export interface UpdateShipmentStatusDto {
  currentStatus: ShipmentStatus;
  currentPort?: string;
  currentLocation?: string;
  eta?: Date;
}

export interface AddEventDto {
  eventType: string;
  title: string;
  description?: string;
  location?: string;
  eventDate: Date;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    @InjectModel(Shipment.name) private shipmentModel: Model<Shipment>,
    @InjectModel(ShipmentEvent.name) private eventModel: Model<ShipmentEvent>,
    @Inject(forwardRef(() => PaymentFlowService))
    private paymentFlowService: PaymentFlowService,
    @Inject(forwardRef(() => CustomerNotificationService))
    private customerNotifications: CustomerNotificationService,
  ) {}

  // === CREATE SHIPMENT ===
  
  async createShipment(dto: CreateShipmentDto): Promise<any> {
    // Check if shipment already exists for this deal
    const existing = await this.shipmentModel.findOne({ dealId: dto.dealId });
    if (existing) {
      throw new BadRequestException('Shipment already exists for this deal');
    }

    const shipment = new this.shipmentModel({
      id: generateId(),
      ...dto,
      currentStatus: ShipmentStatus.DEAL_CREATED,
      trackingActive: false,
      trackingMode: dto.trackingMode || TrackingMode.MANUAL,
    });

    await shipment.save();

    // Add creation event
    await this.addEventInternal(shipment.id, {
      eventType: 'created',
      title: 'Відправлення створено',
      description: `Відправлення для VIN ${dto.vin} створено`,
      location: dto.originPort || 'USA',
      eventDate: new Date(),
    }, ShipmentEventSource.SYSTEM);

    this.logger.log(`Shipment created: ${shipment.id} for VIN ${dto.vin}`);

    return toObjectResponse(shipment.toObject());
  }

  // === UPDATE SHIPMENT ===
  
  async updateShipment(shipmentId: string, dto: UpdateShipmentDto): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    // Update fields
    if (dto.containerNumber !== undefined) shipment.containerNumber = dto.containerNumber;
    if (dto.carrier !== undefined) shipment.carrier = dto.carrier;
    if (dto.vesselName !== undefined) shipment.vesselName = dto.vesselName;
    if (dto.vesselImo !== undefined) shipment.vesselImo = dto.vesselImo;
    if (dto.currentPort !== undefined) shipment.currentPort = dto.currentPort;
    if (dto.destinationPort !== undefined) shipment.destinationPort = dto.destinationPort;
    if (dto.eta !== undefined) shipment.eta = dto.eta;
    if (dto.notes !== undefined) shipment.notes = dto.notes;

    await shipment.save();
    this.logger.log(`Shipment updated: ${shipmentId}`);

    return toObjectResponse(shipment.toObject());
  }

  // === UPDATE SHIPMENT STATUS ===
  
  async updateShipmentStatus(shipmentId: string, dto: UpdateShipmentStatusDto, managerId?: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    // Skip payment flow check for cancelled status and early statuses
    const earlyStatuses = [
      ShipmentStatus.DEAL_CREATED, 
      ShipmentStatus.CONTRACT_SIGNED,
      ShipmentStatus.DEPOSIT_PAID,
      ShipmentStatus.LOT_PAID,
    ];
    
    if (dto.currentStatus !== ShipmentStatus.CANCELLED && !earlyStatuses.includes(dto.currentStatus)) {
      // Check if this status change is allowed by payment flow
      const dealStep = STATUS_TO_STEP[dto.currentStatus];
      if (dealStep) {
        try {
          await this.paymentFlowService.assertCanChangeShipmentStatus(shipment.dealId, dealStep);
        } catch (e) {
          // Auto-initialize payment flow if not exists
          if (e.message?.includes('not initialized') || e.message?.includes('not found')) {
            this.logger.warn(`Auto-initializing payment flow for deal ${shipment.dealId}`);
            await this.paymentFlowService.createFlowState({
              dealId: shipment.dealId,
              userId: shipment.userId,
              managerId: shipment.managerId,
            });
            // Skip blocking for manual manager updates
            this.logger.log(`Payment flow created, allowing manual status update`);
          } else {
            throw e;
          }
        }
      }
    }

    const oldStatus = shipment.currentStatus;
    shipment.currentStatus = dto.currentStatus;
    
    if (dto.currentPort) shipment.currentPort = dto.currentPort;
    if (dto.currentLocation) shipment.currentLocation = dto.currentLocation;
    if (dto.eta) shipment.eta = dto.eta;

    // Update tracking active flag
    shipment.trackingActive = TRACKING_ACTIVE_STATUSES.includes(dto.currentStatus);

    // Update actual dates based on status
    const now = new Date();
    switch (dto.currentStatus) {
      case ShipmentStatus.TRANSPORT_TO_PORT:
        shipment.actualPickupDate = now;
        break;
      case ShipmentStatus.AT_ORIGIN_PORT:
        break;
      case ShipmentStatus.LOADED_ON_VESSEL:
        shipment.actualDepartureDate = now;
        break;
      case ShipmentStatus.AT_DESTINATION_PORT:
        shipment.actualArrivalDate = now;
        break;
      case ShipmentStatus.DELIVERED:
        shipment.actualDeliveryDate = now;
        break;
    }

    await shipment.save();

    // Add status change event
    await this.addEventInternal(shipmentId, {
      eventType: 'status_change',
      title: this.getStatusTitle(dto.currentStatus),
      description: `Статус змінено з "${oldStatus}" на "${dto.currentStatus}"`,
      location: dto.currentPort || dto.currentLocation || shipment.currentPort,
      eventDate: now,
    }, ShipmentEventSource.MANAGER, managerId);

    // Update payment flow current step
    const dealStep = STATUS_TO_STEP[dto.currentStatus];
    if (dealStep && dto.currentStatus !== ShipmentStatus.CANCELLED) {
      try {
        await this.paymentFlowService.updateCurrentStep(shipment.dealId, dealStep);
      } catch (e) {
        // Log but don't fail
        this.logger.warn(`Could not update flow step: ${e.message}`);
      }
    }

    // === REAL-TIME NOTIFICATION ===
    // Send WebSocket + Telegram notification to customer
    if (shipment.userId && oldStatus !== dto.currentStatus) {
      try {
        await this.customerNotifications.notifyShipmentStatusChanged({
          userId: shipment.userId,
          customerId: shipment.customerId,
          shipmentId: shipment.id,
          vin: shipment.vin,
          vehicleTitle: shipment.vehicleTitle,
          oldStatus,
          newStatus: dto.currentStatus,
        });
      } catch (e) {
        this.logger.warn(`Failed to send notification: ${e.message}`);
      }
    }

    this.logger.log(`Shipment ${shipmentId} status updated: ${oldStatus} -> ${dto.currentStatus}`);

    return toObjectResponse(shipment.toObject());
  }

  // === UPDATE ETA ===
  
  async updateEta(shipmentId: string, eta: Date, managerId?: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    const oldEta = shipment.eta;
    shipment.eta = eta;
    await shipment.save();

    // Add ETA change event
    await this.addEventInternal(shipmentId, {
      eventType: 'eta_change',
      title: 'ETA оновлено',
      description: `Очікувана дата прибуття змінена на ${eta.toISOString().split('T')[0]}`,
      location: shipment.currentPort || shipment.destinationPort,
      eventDate: new Date(),
    }, ShipmentEventSource.MANAGER, managerId);

    // === REAL-TIME NOTIFICATION ===
    // Send WebSocket + Telegram notification to customer
    if (shipment.userId) {
      try {
        await this.customerNotifications.notifyEtaChanged({
          userId: shipment.userId,
          customerId: shipment.customerId,
          shipmentId: shipment.id,
          vin: shipment.vin,
          vehicleTitle: shipment.vehicleTitle,
          oldEta: oldEta?.toISOString() || null,
          newEta: eta.toISOString(),
        });
      } catch (e) {
        this.logger.warn(`Failed to send ETA notification: ${e.message}`);
      }
    }

    this.logger.log(`Shipment ${shipmentId} ETA updated: ${oldEta} -> ${eta}`);

    return toObjectResponse(shipment.toObject());
  }

  // === UPDATE CONTAINER ===
  
  async updateContainer(shipmentId: string, containerNumber: string, vesselName?: string, managerId?: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    shipment.containerNumber = containerNumber;
    if (vesselName) shipment.vesselName = vesselName;
    await shipment.save();

    // Add container update event
    await this.addEventInternal(shipmentId, {
      eventType: 'container_update',
      title: 'Контейнер оновлено',
      description: `Номер контейнера: ${containerNumber}${vesselName ? `, Судно: ${vesselName}` : ''}`,
      location: shipment.originPort,
      eventDate: new Date(),
    }, ShipmentEventSource.MANAGER, managerId);

    this.logger.log(`Shipment ${shipmentId} container updated: ${containerNumber}`);

    return toObjectResponse(shipment.toObject());
  }

  // === ADD EVENT ===
  
  async addEvent(shipmentId: string, dto: AddEventDto, managerId?: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    const event = await this.addEventInternal(shipmentId, dto, ShipmentEventSource.MANAGER, managerId);
    
    // Update current location if provided
    if (dto.location) {
      shipment.currentLocation = dto.location;
      await shipment.save();
    }

    return toObjectResponse(event.toObject());
  }

  private async addEventInternal(
    shipmentId: string, 
    dto: AddEventDto, 
    source: ShipmentEventSource,
    createdBy?: string
  ): Promise<ShipmentEvent> {
    const event = new this.eventModel({
      id: generateId(),
      shipmentId,
      ...dto,
      source,
      createdBy,
    });

    await event.save();
    return event;
  }

  // === GET EVENTS ===
  
  async getEvents(shipmentId: string): Promise<any[]> {
    const events = await this.eventModel.find({ shipmentId })
      .sort({ eventDate: -1 })
      .lean();
    
    return events.map(e => toObjectResponse(e));
  }

  // === UPDATE EVENT ===
  
  async updateEvent(eventId: string, dto: Partial<AddEventDto>): Promise<any> {
    const event = await this.eventModel.findOneAndUpdate(
      { id: eventId },
      { $set: dto },
      { new: true }
    ).lean();

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return toObjectResponse(event);
  }

  // === DELETE EVENT ===
  
  async deleteEvent(eventId: string): Promise<{ success: boolean }> {
    const result = await this.eventModel.deleteOne({ id: eventId });
    return { success: result.deletedCount > 0 };
  }

  // === GET SHIPMENT ===
  
  async getShipment(shipmentId: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ id: shipmentId }).lean();
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }
    
    // Get events
    const events = await this.getEvents(shipmentId);
    
    return {
      ...toObjectResponse(shipment),
      events,
    };
  }

  // === GET BY VIN ===
  
  async getByVin(vin: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ vin }).lean();
    return shipment ? toObjectResponse(shipment) : null;
  }

  // === GET BY DEAL ===
  
  async getByDealId(dealId: string): Promise<any> {
    const shipment = await this.shipmentModel.findOne({ dealId }).lean();
    if (!shipment) return null;
    
    const events = await this.getEvents((shipment as any).id);
    return {
      ...toObjectResponse(shipment),
      events,
    };
  }

  // === GET USER SHIPMENTS ===
  
  async getUserShipments(userId: string): Promise<any[]> {
    const shipments = await this.shipmentModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    
    return Promise.all(shipments.map(async s => {
      const events = await this.getEvents((s as any).id);
      return {
        ...toObjectResponse(s),
        events,
      };
    }));
  }

  // === GET MANAGER SHIPMENTS ===
  
  async getManagerShipments(managerId: string): Promise<any[]> {
    const shipments = await this.shipmentModel.find({ managerId })
      .sort({ createdAt: -1 })
      .lean();
    
    return shipments.map(s => toObjectResponse(s));
  }

  // === GET ALL ACTIVE SHIPMENTS (ADMIN) ===
  
  async getActiveShipments(): Promise<any[]> {
    const shipments = await this.shipmentModel.find({
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
    })
      .sort({ eta: 1 })
      .lean();
    
    return shipments.map(s => toObjectResponse(s));
  }

  // === GET DELAYED SHIPMENTS ===
  
  async getDelayedShipments(): Promise<any[]> {
    const now = new Date();
    const shipments = await this.shipmentModel.find({
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
      eta: { $lt: now },
    })
      .sort({ eta: 1 })
      .lean();
    
    return shipments.map(s => toObjectResponse(s));
  }

  // === GET STALLED SHIPMENTS (no update for X days) ===
  
  async getStalledShipments(daysSinceUpdate: number = 7): Promise<any> {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - daysSinceUpdate * 24 * 60 * 60 * 1000);
    
    const shipments = await this.shipmentModel.find({
      currentStatus: { 
        $in: [
          ShipmentStatus.TRANSPORT_TO_PORT,
          ShipmentStatus.AT_ORIGIN_PORT,
          ShipmentStatus.LOADED_ON_VESSEL,
          ShipmentStatus.IN_TRANSIT,
          ShipmentStatus.AT_DESTINATION_PORT,
          ShipmentStatus.CUSTOMS,
        ]
      },
      $or: [
        { lastTrackingUpdate: { $lt: cutoffDate } },
        { lastTrackingUpdate: { $exists: false } },
        { updatedAt: { $lt: cutoffDate } },
      ]
    })
      .sort({ updatedAt: 1 })
      .lean();

    return {
      shipments: shipments.map(s => {
        const shipment = toObjectResponse(s);
        const lastUpdate = (s as any).lastTrackingUpdate || (s as any).updatedAt;
        const daysSinceLastUpdate = lastUpdate 
          ? Math.floor((now.getTime() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        
        return {
          ...shipment,
          daysSinceUpdate: daysSinceLastUpdate,
          issue: !lastUpdate ? 'no_tracking' : 'stalled',
          managerName: (s as any).managerName || null,
        };
      }),
      count: shipments.length,
      daysCutoff: daysSinceUpdate,
    };
  }

  // === GET ANALYTICS ===
  
  async getAnalytics(periodDays: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    const [total, byStatus, avgDeliveryTime, delayedCount] = await Promise.all([
      this.shipmentModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.shipmentModel.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$currentStatus', count: { $sum: 1 } } },
      ]),
      this.shipmentModel.aggregate([
        {
          $match: {
            currentStatus: ShipmentStatus.DELIVERED,
            actualDeliveryDate: { $exists: true },
            actualPickupDate: { $exists: true },
          },
        },
        {
          $project: {
            deliveryTime: {
              $subtract: ['$actualDeliveryDate', '$actualPickupDate'],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: '$deliveryTime' },
          },
        },
      ]),
      this.shipmentModel.countDocuments({
        currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
        eta: { $lt: now },
      }),
    ]);

    const avgDays = avgDeliveryTime[0]?.avgTime
      ? Math.round(avgDeliveryTime[0].avgTime / (1000 * 60 * 60 * 24))
      : 0;

    return {
      total,
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      inTransit: byStatus.find(s => s._id === ShipmentStatus.IN_TRANSIT)?.count || 0,
      delivered: byStatus.find(s => s._id === ShipmentStatus.DELIVERED)?.count || 0,
      delayed: delayedCount,
      avgDeliveryDays: avgDays,
      periodDays,
    };
  }

  private getStatusTitle(status: ShipmentStatus): string {
    const titles: Record<ShipmentStatus, string> = {
      [ShipmentStatus.DEAL_CREATED]: 'Угода створена',
      [ShipmentStatus.CONTRACT_SIGNED]: 'Договір підписано',
      [ShipmentStatus.DEPOSIT_PAID]: 'Депозит сплачено',
      [ShipmentStatus.LOT_PAID]: 'Лот сплачено',
      [ShipmentStatus.TRANSPORT_TO_PORT]: 'Транспортування до порту',
      [ShipmentStatus.AT_ORIGIN_PORT]: 'У порту відправлення',
      [ShipmentStatus.LOADED_ON_VESSEL]: 'Завантажено на судно',
      [ShipmentStatus.IN_TRANSIT]: 'У дорозі',
      [ShipmentStatus.AT_DESTINATION_PORT]: 'У порту призначення',
      [ShipmentStatus.CUSTOMS]: 'Митне оформлення',
      [ShipmentStatus.READY_FOR_PICKUP]: 'Готово до видачі',
      [ShipmentStatus.DELIVERED]: 'Доставлено',
      [ShipmentStatus.CANCELLED]: 'Скасовано',
    };
    return titles[status] || status;
  }
}
