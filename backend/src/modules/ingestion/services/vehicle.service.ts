import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle } from '../schemas/vehicle.schema';
import { VehicleStatus, VehicleSource } from '../enums/vehicle.enum';
import { VehicleQueryDto, VehicleStatsDto } from '../dto/vehicle-query.dto';
import { generateId, toObjectResponse, toArrayResponse } from '../../../shared/utils';

/**
 * Vehicle Service
 * 
 * CRUD операції та бізнес-логіка для vehicles
 * Дедуплікація по VIN
 */
@Injectable()
export class VehicleService {
  private readonly logger = new Logger(VehicleService.name);

  constructor(
    @InjectModel(Vehicle.name) private vehicleModel: Model<Vehicle>,
  ) {}

  /**
   * Upsert by VIN - основний метод для дедуплікації
   * 
   * Якщо VIN існує → update
   * Якщо VIN не існує → create
   */
  async upsertByVin(data: Partial<Vehicle>): Promise<{ id: string; isNew: boolean }> {
    const existingVehicle = await this.vehicleModel.findOne({ 
      vin: data.vin,
      isDeleted: false,
    });

    if (existingVehicle) {
      // Update existing
      await this.vehicleModel.updateOne(
        { vin: data.vin },
        {
          ...data,
          lastSyncedAt: new Date(),
          $inc: { syncCount: 1 },
        },
      );
      
      this.logger.debug(`Updated vehicle ${data.vin}`);
      return { id: existingVehicle.id, isNew: false };
    } else {
      // Create new
      const vehicle = new this.vehicleModel({
        id: generateId(),
        ...data,
        syncCount: 1,
      });
      
      await vehicle.save();
      this.logger.debug(`Created vehicle ${data.vin}`);
      return { id: vehicle.id, isNew: true };
    }
  }

  /**
   * Отримати vehicle по ID
   */
  async findById(id: string): Promise<any> {
    const vehicle = await this.vehicleModel.findOne({ id, isDeleted: false });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }
    return toObjectResponse(vehicle);
  }

  /**
   * Отримати vehicle по VIN
   */
  async findByVin(vin: string): Promise<any> {
    const vehicle = await this.vehicleModel.findOne({ 
      vin: vin.toUpperCase(), 
      isDeleted: false,
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with VIN ${vin} not found`);
    }
    return toObjectResponse(vehicle);
  }

  /**
   * Пошук з фільтрами та пагінацією
   */
  async findAll(query: VehicleQueryDto): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const filter: any = { isDeleted: false };

    // Пошук
    if (query.search) {
      const searchRegex = new RegExp(query.search, 'i');
      filter.$or = [
        { vin: searchRegex },
        { title: searchRegex },
        { make: searchRegex },
        { vehicleModel: searchRegex },
        { lotNumber: searchRegex },
      ];
    }

    // Фільтри
    if (query.source) filter.source = query.source;
    if (query.status) filter.status = query.status;
    if (query.make) filter.make = new RegExp(query.make, 'i');
    if (query.model) filter.vehicleModel = new RegExp(query.model, 'i');
    if (query.bodyType) filter.bodyType = query.bodyType;
    if (query.engineType) filter.engineType = query.engineType;

    // Year range
    if (query.yearFrom || query.yearTo) {
      filter.year = {};
      if (query.yearFrom) filter.year.$gte = query.yearFrom;
      if (query.yearTo) filter.year.$lte = query.yearTo;
    }

    // Price range
    if (query.priceFrom || query.priceTo) {
      filter.price = {};
      if (query.priceFrom) filter.price.$gte = query.priceFrom;
      if (query.priceTo) filter.price.$lte = query.priceTo;
    }

    // Boolean filters
    if (query.hasImages !== undefined) {
      if (query.hasImages) {
        filter.images = { $exists: true, $ne: [] };
      } else {
        filter.$or = [
          { images: { $exists: false } },
          { images: { $size: 0 } },
        ];
      }
    }

    if (query.isRunnable !== undefined) {
      filter.isRunnable = query.isRunnable;
    }

    // Sorting
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    // Pagination
    const limit = Math.min(query.limit || 20, 100);
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.vehicleModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.vehicleModel.countDocuments(filter),
    ]);

    return {
      data: toArrayResponse(data),
      total,
      page,
      limit,
    };
  }

  /**
   * Статистика для dashboard
   */
  async getStats(): Promise<VehicleStatsDto> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      total,
      active,
      sold,
      reserved,
      archived,
      newToday,
      updatedToday,
      bySourceAgg,
      avgPriceAgg,
    ] = await Promise.all([
      this.vehicleModel.countDocuments({ isDeleted: false }),
      this.vehicleModel.countDocuments({ status: VehicleStatus.ACTIVE, isDeleted: false }),
      this.vehicleModel.countDocuments({ status: VehicleStatus.SOLD, isDeleted: false }),
      this.vehicleModel.countDocuments({ status: VehicleStatus.RESERVED, isDeleted: false }),
      this.vehicleModel.countDocuments({ status: VehicleStatus.ARCHIVED, isDeleted: false }),
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
      ]),
      this.vehicleModel.aggregate([
        { $match: { isDeleted: false, price: { $gt: 0 } } },
        { $group: { _id: null, avgPrice: { $avg: '$price' } } },
      ]),
    ]);

    const bySource: Record<string, number> = {};
    for (const item of bySourceAgg) {
      bySource[item._id] = item.count;
    }

    return {
      total,
      active,
      sold,
      reserved,
      archived,
      newToday,
      updatedToday,
      bySource,
      avgPrice: avgPriceAgg[0]?.avgPrice || 0,
    };
  }

  /**
   * Оновити статус vehicle
   */
  async updateStatus(id: string, status: VehicleStatus, userId?: string): Promise<any> {
    const vehicle = await this.vehicleModel.findOneAndUpdate(
      { id, isDeleted: false },
      { 
        status,
        ...(status === VehicleStatus.RESERVED && userId ? { reservedBy: userId, reservedAt: new Date() } : {}),
      },
      { new: true },
    );

    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }

    return toObjectResponse(vehicle);
  }

  /**
   * Soft delete
   */
  async remove(id: string): Promise<void> {
    const result = await this.vehicleModel.updateOne(
      { id },
      { isDeleted: true, deletedAt: new Date() },
    );

    if (result.modifiedCount === 0) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }
  }

  /**
   * Отримати унікальні makes для фільтрів
   */
  async getUniqueMakes(): Promise<string[]> {
    return await this.vehicleModel.distinct('make', { 
      isDeleted: false, 
      make: { $exists: true, $ne: null },
    });
  }

  /**
   * Отримати унікальні models для make
   */
  async getUniqueModels(make?: string): Promise<string[]> {
    const filter: any = { 
      isDeleted: false, 
      vehicleModel: { $exists: true, $ne: null },
    };
    if (make) filter.make = make;
    
    return await this.vehicleModel.distinct('vehicleModel', filter);
  }

  /**
   * Link vehicle to lead/deal
   */
  async linkToCrm(id: string, data: { leadId?: string; dealId?: string }): Promise<any> {
    const vehicle = await this.vehicleModel.findOneAndUpdate(
      { id, isDeleted: false },
      { 
        linkedLeadId: data.leadId,
        linkedDealId: data.dealId,
      },
      { new: true },
    );

    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }

    return toObjectResponse(vehicle);
  }
}
