/**
 * Vehicles Controller
 * 
 * API для роботи з авто для менеджерів/адмінів
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Vehicle } from '../schemas/vehicle.schema';
import { Lead } from '../../leads/lead.schema';
import { UserRole, LeadSource } from '../../../shared/enums';
import { VehicleStatus } from '../enums/vehicle.enum';
import { generateId } from '../../../shared/utils';

interface VehicleQueryDto {
  page?: string;
  limit?: string;
  source?: string;
  minPrice?: string;
  maxPrice?: string;
  make?: string;
  year?: string;
  status?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

interface CreateLeadDto {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
}

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(
    @InjectModel(Vehicle.name) private vehicleModel: Model<Vehicle>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
  ) {}

  /**
   * GET /api/vehicles
   * 
   * Список авто з фільтрами та пагінацією
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getVehicles(@Query() query: VehicleQueryDto): Promise<any> {
    const {
      page = '1',
      limit = '20',
      source,
      minPrice,
      maxPrice,
      make,
      year,
      status = VehicleStatus.ACTIVE,
      search,
      sort = 'createdAt',
      order = 'desc',
    } = query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter: any = {
      isDeleted: { $ne: true },
    };

    if (status) filter.status = status;
    if (source) filter.source = source;
    if (make) filter.make = { $regex: make, $options: 'i' };
    if (year) filter.year = parseInt(year);

    // Price filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseInt(minPrice);
      if (maxPrice) filter.price.$lte = parseInt(maxPrice);
    }

    // Search by VIN or title
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
        .select('-metadata -__v')
        .lean(),
      this.vehicleModel.countDocuments(filter),
    ]);

    // Transform _id
    const items = vehicles.map(v => ({
      ...v,
      _id: undefined,
    }));

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: skip + limitNum < total,
      },
    };
  }

  /**
   * GET /api/vehicles/stats
   * 
   * Статистика по авто
   */
  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getStats() {
    const [total, bySource, byStatus, priceRange] = await Promise.all([
      this.vehicleModel.countDocuments({ isDeleted: { $ne: true } }),
      this.vehicleModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      this.vehicleModel.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.vehicleModel.aggregate([
        { $match: { isDeleted: { $ne: true }, price: { $exists: true, $gt: 0 } } },
        { $group: { _id: null, minPrice: { $min: '$price' }, maxPrice: { $max: '$price' }, avgPrice: { $avg: '$price' } } },
      ]),
    ]);

    return {
      total,
      bySource: bySource.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
      byStatus: byStatus.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
      priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 },
    };
  }

  /**
   * GET /api/vehicles/makes
   * 
   * Список марок для фільтра
   */
  @Get('makes')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getMakes() {
    const makes = await this.vehicleModel.aggregate([
      { $match: { isDeleted: { $ne: true }, make: { $exists: true, $ne: null } } },
      { $group: { _id: '$make', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);

    return makes.map(m => ({ make: m._id, count: m.count }));
  }

  /**
   * GET /api/vehicles/:id
   * 
   * Деталі авто
   */
  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getVehicle(@Param('id') id: string): Promise<any> {
    const vehicle = await this.vehicleModel
      .findOne({ $or: [{ id }, { vin: id }], isDeleted: { $ne: true } })
      .select('-__v')
      .lean();

    if (!vehicle) {
      throw new NotFoundException('Авто не знайдено');
    }

    // Check if already has lead
    let linkedLead: any = null;
    if (vehicle.linkedLeadId) {
      linkedLead = await this.leadModel.findOne({ id: vehicle.linkedLeadId }).select('id firstName lastName status').lean();
    }

    return {
      ...vehicle,
      _id: undefined,
      linkedLead,
    };
  }

  /**
   * POST /api/vehicles/:id/create-lead
   * 
   * Створити лід з авто
   */
  @Post(':id/create-lead')
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  @HttpCode(HttpStatus.CREATED)
  async createLead(
    @Param('id') id: string,
    @Body() dto: CreateLeadDto,
    @Req() req: any,
  ) {
    const vehicle = await this.vehicleModel.findOne({ 
      $or: [{ id }, { vin: id }], 
      isDeleted: { $ne: true } 
    });

    if (!vehicle) {
      throw new NotFoundException('Авто не знайдено');
    }

    // Check if already has lead
    if (vehicle.linkedLeadId) {
      const existingLead = await this.leadModel.findOne({ id: vehicle.linkedLeadId });
      if (existingLead) {
        return {
          success: false,
          message: 'Лід вже існує для цього авто',
          lead: existingLead,
        };
      }
    }

    // Create lead
    const leadId = generateId();
    const leadSource = vehicle.source === 'copart' ? LeadSource.VEHICLE_COPART : LeadSource.VEHICLE_IAAI;
    const lead = await this.leadModel.create({
      id: leadId,
      firstName: dto.customerName || 'Клієнт',
      lastName: `(${vehicle.vin})`,
      email: dto.customerEmail || undefined,
      phone: dto.customerPhone,
      source: leadSource,
      status: 'new',
      notes: dto.notes || `Авто: ${vehicle.title}\nVIN: ${vehicle.vin}\nЦіна: ${vehicle.price} ${vehicle.currency || 'USD'}`,
      assignedTo: req.user?.id,
      metadata: {
        vehicleId: vehicle.id,
        vehicleVin: vehicle.vin,
        vehicleTitle: vehicle.title,
        vehiclePrice: vehicle.price,
        vehicleSource: vehicle.source,
        vehicleImage: vehicle.primaryImage || vehicle.images?.[0],
      },
    });

    // Link vehicle to lead
    vehicle.linkedLeadId = leadId;
    vehicle.status = VehicleStatus.RESERVED;
    vehicle.reservedBy = req.user?.id;
    vehicle.reservedAt = new Date();
    await vehicle.save();

    return {
      success: true,
      message: 'Лід створено',
      lead: {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        status: lead.status,
      },
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        status: vehicle.status,
      },
    };
  }

  /**
   * POST /api/vehicles/:id/unreserve
   * 
   * Зняти резерв з авто
   */
  @Post(':id/unreserve')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async unreserve(@Param('id') id: string) {
    const vehicle = await this.vehicleModel.findOne({ 
      $or: [{ id }, { vin: id }], 
      isDeleted: { $ne: true } 
    });

    if (!vehicle) {
      throw new NotFoundException('Авто не знайдено');
    }

    vehicle.status = VehicleStatus.ACTIVE;
    vehicle.linkedLeadId = undefined;
    vehicle.reservedBy = undefined;
    vehicle.reservedAt = undefined;
    await vehicle.save();

    return { success: true, message: 'Резерв знято' };
  }
}
