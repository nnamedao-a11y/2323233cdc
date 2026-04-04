/**
 * Dedup Service
 * 
 * Дедуплікація по VIN - VIN є primary key
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle } from '../ingestion/schemas/vehicle.schema';

@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  constructor(
    @InjectModel(Vehicle.name)
    private vehicleModel: Model<Vehicle>,
  ) {}

  async findByVin(vin: string): Promise<Vehicle | null> {
    if (!vin) return null;
    
    const normalized = vin.toUpperCase().trim();
    return this.vehicleModel.findOne({ 
      vin: normalized,
      isDeleted: { $ne: true }
    });
  }

  async exists(vin: string): Promise<boolean> {
    if (!vin) return false;
    
    const count = await this.vehicleModel.countDocuments({ 
      vin: vin.toUpperCase().trim(),
      isDeleted: { $ne: true }
    });
    
    return count > 0;
  }

  async findDuplicates(vin: string): Promise<Vehicle[]> {
    if (!vin) return [];
    
    return this.vehicleModel.find({ 
      vin: vin.toUpperCase().trim()
    }).sort({ createdAt: -1 });
  }
}
