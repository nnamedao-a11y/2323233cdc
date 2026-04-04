import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle } from '../../ingestion/schemas/vehicle.schema';
import { VehicleStatus, VehicleSource } from '../../ingestion/enums/vehicle.enum';

export interface VehiclesDashboardData {
  total: number;
  active: number;
  sold: number;
  reserved: number;
  newToday: number;
  updatedToday: number;
  bySource: Array<{ source: string; count: number }>;
  avgPrice: number;
  recentVehicles: Array<{
    id: string;
    vin: string;
    title: string;
    source: string;
    price: number;
    status: string;
    createdAt: Date;
  }>;
}

@Injectable()
export class VehiclesDashboardService {
  constructor(
    @InjectModel(Vehicle.name) private vehicleModel: Model<Vehicle>,
  ) {}

  async getVehiclesDashboard(): Promise<VehiclesDashboardData> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      total,
      active,
      sold,
      reserved,
      newToday,
      updatedToday,
      bySourceAgg,
      avgPriceAgg,
      recentVehicles,
    ] = await Promise.all([
      this.vehicleModel.countDocuments({ isDeleted: false }),
      this.vehicleModel.countDocuments({ status: VehicleStatus.ACTIVE, isDeleted: false }),
      this.vehicleModel.countDocuments({ status: VehicleStatus.SOLD, isDeleted: false }),
      this.vehicleModel.countDocuments({ status: VehicleStatus.RESERVED, isDeleted: false }),
      this.vehicleModel.countDocuments({ 
        createdAt: { $gte: todayStart },
        isDeleted: false,
      }),
      this.vehicleModel.countDocuments({ 
        lastSyncedAt: { $gte: todayStart },
        syncCount: { $gt: 1 },
        isDeleted: false,
      }),
      this.vehicleModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.vehicleModel.aggregate([
        { $match: { isDeleted: false, price: { $gt: 0 } } },
        { $group: { _id: null, avgPrice: { $avg: '$price' } } },
      ]),
      this.vehicleModel
        .find({ isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('id vin title source price status createdAt')
        .lean()
        .exec(),
    ]);

    const bySource = bySourceAgg.map(item => ({
      source: item._id,
      count: item.count,
    }));

    return {
      total,
      active,
      sold,
      reserved,
      newToday,
      updatedToday,
      bySource,
      avgPrice: Math.round(avgPriceAgg[0]?.avgPrice || 0),
      recentVehicles: recentVehicles.map((v: any) => ({
        id: v.id,
        vin: v.vin,
        title: v.title,
        source: v.source,
        price: v.price || 0,
        status: v.status,
        createdAt: v.createdAt,
      })),
    };
  }
}
