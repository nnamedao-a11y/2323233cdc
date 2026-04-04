/**
 * VIN Status Service
 * 
 * Визначає статус аукціону:
 * - ACTIVE_AUCTION: дата аукціону в майбутньому
 * - AUCTION_FINISHED: дата аукціону в минулому
 * - HISTORICAL_RECORD: є історичні дані без дати аукціону
 * - NOT_FOUND: нічого не знайдено
 */

import { Injectable, Logger } from '@nestjs/common';
import { MergedVehicle } from '../interfaces/merged-vehicle.interface';
import { VinStatus } from '../dto/vin-resolver-response.dto';

@Injectable()
export class VinStatusService {
  private readonly logger = new Logger(VinStatusService.name);

  detect(vehicle: MergedVehicle | null): VinStatus {
    if (!vehicle) {
      return 'NOT_FOUND';
    }

    // No sale date - check if we have auction-related data
    if (!vehicle.saleDate) {
      // Has lot number = likely auction but no date
      if (vehicle.lotNumber || vehicle.price) {
        return 'HISTORICAL_RECORD';
      }
      
      // Has basic vehicle info only
      if (vehicle.year || vehicle.make || vehicle.model) {
        return 'HISTORICAL_RECORD';
      }

      return 'NOT_FOUND';
    }

    // Parse sale date
    const saleDate = new Date(vehicle.saleDate);
    if (isNaN(saleDate.getTime())) {
      this.logger.warn(`[Status] Invalid sale date format: ${vehicle.saleDate}`);
      return 'HISTORICAL_RECORD';
    }

    const now = new Date();

    // Sale date in future = active auction
    if (saleDate.getTime() > now.getTime()) {
      return 'ACTIVE_AUCTION';
    }

    // Sale date in past = auction finished
    return 'AUCTION_FINISHED';
  }

  /**
   * Get status message in Ukrainian
   */
  getStatusMessage(status: VinStatus, vehicle: MergedVehicle | null): string {
    switch (status) {
      case 'ACTIVE_AUCTION':
        const saleDate = vehicle?.saleDate ? new Date(vehicle.saleDate).toLocaleDateString('uk-UA') : '';
        return `Активний аукціон${saleDate ? ` (${saleDate})` : ''}, ${vehicle?.sourceCount || 0} джерел`;
      
      case 'AUCTION_FINISHED':
        return `Аукціон завершено, ${vehicle?.sourceCount || 0} джерел`;
      
      case 'HISTORICAL_RECORD':
        return `Знайдено історичні дані, ${vehicle?.sourceCount || 0} джерел`;
      
      case 'NOT_FOUND':
        return 'Інформацію не знайдено';
    }
  }
}
