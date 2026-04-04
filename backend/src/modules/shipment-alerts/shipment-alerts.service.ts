/**
 * Shipment Alerts Service
 * 
 * Handles shipment stall detection, delay alerts, and ETA change notifications
 * 
 * Rules:
 * - Stalled: No update for 48h → alert manager + team lead
 * - Delayed: ETA passed but not delivered → alert user + manager
 * - ETA changed: Notify user + manager
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { ShipmentAlertLog, ShipmentAlertType } from './shipment-alert-log.schema';
import { Shipment, ShipmentStatus } from '../shipping/shipment.schema';
import { generateId } from '../../shared/utils';

// Thresholds
const STALLED_HOURS = 48;
const CRITICAL_DELAY_DAYS = 7;

@Injectable()
export class ShipmentAlertsService {
  private readonly logger = new Logger(ShipmentAlertsService.name);

  constructor(
    @InjectModel(Shipment.name) private shipmentModel: Model<Shipment>,
    @InjectModel(ShipmentAlertLog.name) private alertLogModel: Model<ShipmentAlertLog>,
  ) {}

  /**
   * Main cron job - runs every hour
   */
  @Cron('30 * * * *')
  async processShipmentAlerts(): Promise<void> {
    this.logger.log('Starting shipment alert processing...');
    
    try {
      const shipments = await this.getActiveShipments();
      let stalledCount = 0;
      let delayedCount = 0;

      for (const shipment of shipments) {
        if (await this.checkStalled(shipment)) stalledCount++;
        if (await this.checkDelayed(shipment)) delayedCount++;
      }

      this.logger.log(`Processed ${shipments.length} shipments: ${stalledCount} stalled, ${delayedCount} delayed`);
    } catch (error) {
      this.logger.error(`Shipment alert error: ${error.message}`);
    }
  }

  /**
   * Get all active shipments (not delivered or cancelled)
   */
  async getActiveShipments(): Promise<any[]> {
    return this.shipmentModel.find({
      currentStatus: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED] },
    }).lean();
  }

  /**
   * Check if shipment is stalled (no update for 48h)
   */
  async checkStalled(shipment: any): Promise<boolean> {
    const now = Date.now();
    const updatedAt = new Date(shipment.updatedAt).getTime();
    const hoursSinceUpdate = (now - updatedAt) / (1000 * 60 * 60);

    if (hoursSinceUpdate >= STALLED_HOURS) {
      const already = await this.hasAlert(shipment.id, ShipmentAlertType.STALLED);
      if (!already) {
        await this.sendStalledAlert(shipment, hoursSinceUpdate);
        await this.logAlert(shipment, ShipmentAlertType.STALLED, {
          hoursSinceUpdate,
          lastUpdatedAt: shipment.updatedAt,
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Check if shipment is delayed (ETA passed but not delivered)
   */
  async checkDelayed(shipment: any): Promise<boolean> {
    if (!shipment.eta) return false;

    const now = Date.now();
    const eta = new Date(shipment.eta).getTime();

    if (now > eta && shipment.currentStatus !== ShipmentStatus.DELIVERED) {
      const daysDelayed = Math.floor((now - eta) / (1000 * 60 * 60 * 24));
      
      const already = await this.hasAlert(shipment.id, ShipmentAlertType.DELAYED);
      if (!already) {
        await this.sendDelayedAlert(shipment, daysDelayed);
        await this.logAlert(shipment, ShipmentAlertType.DELAYED, {
          daysDelayed,
          originalEta: shipment.eta,
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Process ETA change - called from shipping service
   */
  async processEtaChanged(shipmentId: string, oldEta: Date, newEta: Date): Promise<void> {
    if (!oldEta || !newEta) return;
    if (oldEta.getTime() === newEta.getTime()) return;

    const shipment = await this.shipmentModel.findOne({ id: shipmentId }).lean();
    if (!shipment) return;

    const delayDays = Math.ceil((newEta.getTime() - oldEta.getTime()) / (1000 * 60 * 60 * 24));

    await this.sendEtaChangedAlert(shipment, oldEta, newEta, delayDays);
    await this.logAlert(shipment, ShipmentAlertType.ETA_CHANGED, {
      oldEta: oldEta.toISOString(),
      newEta: newEta.toISOString(),
      delayDays,
    });

    this.logger.log(`ETA change alert sent for shipment ${shipmentId}: ${delayDays} days change`);
  }

  /**
   * Send stalled shipment alert
   */
  async sendStalledAlert(shipment: any, hoursSinceUpdate: number): Promise<void> {
    // TODO: Implement actual notification dispatch
    // - Telegram to manager
    // - Telegram to team lead
    // - Cabinet notification

    this.logger.warn(`STALLED ALERT: Shipment ${shipment.id} (VIN: ${shipment.vin}) - No update for ${Math.round(hoursSinceUpdate)}h`);
  }

  /**
   * Send delayed shipment alert
   */
  async sendDelayedAlert(shipment: any, daysDelayed: number): Promise<void> {
    // TODO: Implement actual notification dispatch
    // - Cabinet notification to user
    // - Email to user
    // - Telegram to manager
    // - If critical (>7 days) → team lead + owner

    const isCritical = daysDelayed >= CRITICAL_DELAY_DAYS;
    
    this.logger.warn(`DELAYED ALERT: Shipment ${shipment.id} (VIN: ${shipment.vin}) - ${daysDelayed} days overdue${isCritical ? ' [CRITICAL]' : ''}`);
  }

  /**
   * Send ETA changed alert
   */
  async sendEtaChangedAlert(shipment: any, oldEta: Date, newEta: Date, delayDays: number): Promise<void> {
    // TODO: Implement actual notification dispatch
    // - Cabinet notification to user
    // - Email to user
    // - Telegram to manager

    this.logger.log(`ETA CHANGE: Shipment ${shipment.id} (VIN: ${shipment.vin}) - New ETA: ${newEta.toISOString().split('T')[0]} (${delayDays > 0 ? '+' : ''}${delayDays} days)`);
  }

  /**
   * Check if alert already exists
   */
  async hasAlert(shipmentId: string, alertType: ShipmentAlertType): Promise<boolean> {
    // Check for unresolved alert of this type
    const alert = await this.alertLogModel.findOne({
      shipmentId,
      alertType,
      resolvedAt: { $exists: false },
    });
    return !!alert;
  }

  /**
   * Log alert
   */
  async logAlert(shipment: any, alertType: ShipmentAlertType, metadata: any): Promise<void> {
    const log = new this.alertLogModel({
      id: generateId(),
      shipmentId: shipment.id,
      dealId: shipment.dealId,
      alertType,
      sentToUser: alertType !== ShipmentAlertType.STALLED,
      sentToManager: true,
      sentToTeamLead: alertType === ShipmentAlertType.STALLED || (metadata.daysDelayed && metadata.daysDelayed >= CRITICAL_DELAY_DAYS),
      sentToOwner: metadata.daysDelayed && metadata.daysDelayed >= CRITICAL_DELAY_DAYS,
      metadata,
    });
    await log.save();
  }

  /**
   * Resolve alert (when shipment is updated or delivered)
   */
  async resolveAlerts(shipmentId: string): Promise<void> {
    await this.alertLogModel.updateMany(
      { shipmentId, resolvedAt: { $exists: false } },
      { $set: { resolvedAt: new Date() } }
    );
    this.logger.log(`Alerts resolved for shipment ${shipmentId}`);
  }

  // === API Methods ===

  /**
   * Get all unresolved stalled shipments
   */
  async getStalledShipments(): Promise<any[]> {
    const alerts = await this.alertLogModel.find({
      alertType: ShipmentAlertType.STALLED,
      resolvedAt: { $exists: false },
    }).lean();

    const shipmentIds = alerts.map(a => a.shipmentId);
    return this.shipmentModel.find({ id: { $in: shipmentIds } }).lean();
  }

  /**
   * Get all delayed shipments
   */
  async getDelayedShipments(): Promise<any[]> {
    const alerts = await this.alertLogModel.find({
      alertType: ShipmentAlertType.DELAYED,
      resolvedAt: { $exists: false },
    }).lean();

    const shipmentIds = alerts.map(a => a.shipmentId);
    return this.shipmentModel.find({ id: { $in: shipmentIds } }).lean();
  }

  /**
   * Get alert summary (for dashboard)
   */
  async getAlertSummary(): Promise<any> {
    const [stalled, delayed, etaChanged] = await Promise.all([
      this.alertLogModel.countDocuments({ alertType: ShipmentAlertType.STALLED, resolvedAt: { $exists: false } }),
      this.alertLogModel.countDocuments({ alertType: ShipmentAlertType.DELAYED, resolvedAt: { $exists: false } }),
      this.alertLogModel.countDocuments({ alertType: ShipmentAlertType.ETA_CHANGED, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
    ]);

    return {
      stalledCount: stalled,
      delayedCount: delayed,
      etaChangedLast7Days: etaChanged,
    };
  }

  /**
   * Force process alerts (for testing)
   */
  async forceProcessAlerts(): Promise<{ processed: number; stalled: number; delayed: number }> {
    const shipments = await this.getActiveShipments();
    let stalled = 0;
    let delayed = 0;

    for (const shipment of shipments) {
      if (await this.checkStalled(shipment)) stalled++;
      if (await this.checkDelayed(shipment)) delayed++;
    }

    return { processed: shipments.length, stalled, delayed };
  }
}
