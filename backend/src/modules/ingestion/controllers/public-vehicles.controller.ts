/**
 * Public Vehicles Controller
 * 
 * Public API for vehicles catalog - NO AUTH REQUIRED
 * Used by public website /cars page
 */

import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Vehicle } from '../schemas/vehicle.schema';
import { VehicleStatus } from '../enums/vehicle.enum';

interface PublicVehicleQuery {
  page?: string;
  limit?: string;
  make?: string;
  minPrice?: string;
  maxPrice?: string;
  year?: string;
  source?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  status?: string;
}

@Controller('public/vehicles')
export class PublicVehiclesController {
  constructor(
    @InjectModel(Vehicle.name) private vehicleModel: Model<Vehicle>,
  ) {}

  /**
   * GET /api/public/vehicles
   * 
   * Public vehicle catalog with filters
   */
  @Get()
  async getPublicVehicles(@Query() query: PublicVehicleQuery) {
    const {
      page = '1',
      limit = '20',
      make,
      minPrice,
      maxPrice,
      year,
      source,
      search,
      sort = 'createdAt',
      order = 'desc',
      status,
    } = query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build filter - only show active/available vehicles
    const filter: any = {
      isDeleted: { $ne: true },
      status: { $in: [VehicleStatus.ACTIVE, 'available', 'published'] },
    };

    // Allow specific status filter
    if (status === 'hot') {
      filter.isHot = true;
    } else if (status === 'ending') {
      filter.auctionDate = {
        $gte: new Date(),
        $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
      };
    } else if (status === 'future') {
      filter.auctionDate = {
        $gt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      };
    }

    if (make) filter.make = { $regex: make, $options: 'i' };
    if (year) filter.year = parseInt(year);
    if (source) filter.source = source;

    // Price filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseInt(minPrice);
      if (maxPrice) filter.price.$lte = parseInt(maxPrice);
    }

    // Search
    if (search) {
      filter.$or = [
        { vin: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { vehicleModel: { $regex: search, $options: 'i' } },
      ];
    }

    // Sort
    const sortObj: any = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    const [vehicles, total] = await Promise.all([
      this.vehicleModel
        .find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .select('id vin title make vehicleModel year price mileage primaryImage images source auctionDate slug isHot status fuelType transmission location')
        .lean(),
      this.vehicleModel.countDocuments(filter),
    ]);

    // Transform for public API
    const data = (vehicles as any[]).map(v => ({
      id: v.id || v._id?.toString(),
      vin: v.vin,
      title: v.title || `${v.make} ${v.vehicleModel} ${v.year}`,
      make: v.make,
      model: v.vehicleModel,
      year: v.year,
      price: v.price,
      mileage: v.mileage,
      image: v.primaryImage || v.images?.[0],
      images: v.images || [],
      source: v.source,
      auctionDate: v.auctionDate,
      slug: v.slug || v.vin,
      isHot: v.isHot,
      fuelType: v.fuelType,
      transmission: v.transmission,
      location: v.location,
    }));

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      hasMore: skip + limitNum < total,
    };
  }

  /**
   * GET /api/public/vehicles/makes
   * 
   * List of available makes for filter
   */
  @Get('makes')
  async getMakes() {
    const makes = await this.vehicleModel.aggregate([
      { 
        $match: { 
          isDeleted: { $ne: true }, 
          status: { $in: [VehicleStatus.ACTIVE, 'available', 'published'] },
          make: { $exists: true, $ne: null } 
        } 
      },
      { $group: { _id: '$make', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 30 },
    ]);

    return makes.map(m => ({ make: m._id, count: m.count }));
  }

  /**
   * GET /api/public/vehicles/featured
   * 
   * Featured/hot vehicles for homepage
   */
  @Get('featured')
  async getFeatured() {
    const vehicles = await this.vehicleModel
      .find({
        isDeleted: { $ne: true },
        status: { $in: [VehicleStatus.ACTIVE, 'available', 'published'] },
        $or: [
          { isHot: true },
          { auctionDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
        ],
      })
      .sort({ isHot: -1, auctionDate: 1 })
      .limit(8)
      .select('id vin title make vehicleModel year price primaryImage images source auctionDate slug isHot')
      .lean();

    return (vehicles as any[]).map(v => ({
      id: v.id || v._id?.toString(),
      vin: v.vin,
      title: v.title || `${v.make} ${v.vehicleModel} ${v.year}`,
      make: v.make,
      model: v.vehicleModel,
      year: v.year,
      price: v.price,
      image: v.primaryImage || v.images?.[0],
      source: v.source,
      auctionDate: v.auctionDate,
      slug: v.slug || v.vin,
      isHot: v.isHot,
    }));
  }

  /**
   * GET /api/public/vehicles/:idOrSlug
   * 
   * Vehicle details by ID, VIN or slug
   */
  @Get(':idOrSlug')
  async getVehicle(@Param('idOrSlug') idOrSlug: string) {
    const vehicle = await this.vehicleModel
      .findOne({
        isDeleted: { $ne: true },
        $or: [
          { id: idOrSlug },
          { vin: idOrSlug },
          { slug: idOrSlug },
        ],
      })
      .select('-metadata -__v -linkedLeadId -reservedBy -reservedAt')
      .lean() as any;

    if (!vehicle) {
      throw new NotFoundException('Авто не знайдено');
    }

    return {
      id: vehicle.id || vehicle._id?.toString(),
      vin: vehicle.vin,
      title: vehicle.title || `${vehicle.make} ${vehicle.vehicleModel} ${vehicle.year}`,
      make: vehicle.make,
      model: vehicle.vehicleModel,
      year: vehicle.year,
      price: vehicle.price,
      mileage: vehicle.mileage,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      images: vehicle.images || [],
      primaryImage: vehicle.primaryImage,
      source: vehicle.source,
      auctionDate: vehicle.auctionDate,
      location: vehicle.location,
      slug: vehicle.slug || vehicle.vin,
      isHot: vehicle.isHot,
      description: vehicle.description,
      damageType: vehicle.damageType,
      driveType: vehicle.driveType,
      color: vehicle.color,
      engine: vehicle.engine,
      bodyType: vehicle.bodyType,
      status: vehicle.status,
    };
  }
}
