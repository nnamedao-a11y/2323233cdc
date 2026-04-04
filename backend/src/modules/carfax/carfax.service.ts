/**
 * Carfax Manual Flow Service
 * 
 * Business Logic:
 * 1. User creates request by VIN
 * 2. Request appears in manager queue
 * 3. Manager: approve → processing → upload PDF
 * 4. Or Manager: reject with reason
 * 5. User gets PDF in cabinet
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CarfaxRequest, CarfaxRequestStatus } from './carfax.schema';
import { generateId, toObjectResponse, toArrayResponse } from '../../shared/utils';

export interface CreateCarfaxRequestDto {
  userId: string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  vin: string;
}

@Injectable()
export class CarfaxService {
  private readonly logger = new Logger(CarfaxService.name);
  private readonly REPORT_EXPIRY_DAYS = 30; // Report access expires after 30 days
  private readonly ESTIMATED_COST = 45; // Average Carfax cost in USD

  constructor(
    @InjectModel(CarfaxRequest.name) private carfaxModel: Model<CarfaxRequest>,
  ) {}

  // === USER: CREATE REQUEST ===
  
  async createRequest(dto: CreateCarfaxRequestDto): Promise<CarfaxRequest> {
    // Validate VIN
    if (!dto.vin || dto.vin.length !== 17) {
      throw new BadRequestException('Invalid VIN format. VIN must be 17 characters.');
    }

    // Check for duplicate pending request
    const existing = await this.carfaxModel.findOne({
      userId: dto.userId,
      vin: dto.vin.toUpperCase(),
      status: { $in: [CarfaxRequestStatus.PENDING, CarfaxRequestStatus.PROCESSING] },
    });

    if (existing) {
      throw new BadRequestException('You already have a pending request for this VIN.');
    }

    // Check if we already have this VIN uploaded (cache hit)
    const cached = await this.carfaxModel.findOne({
      vin: dto.vin.toUpperCase(),
      status: CarfaxRequestStatus.UPLOADED,
      expiresAt: { $gt: new Date() },
    });

    if (cached) {
      // Create a new request linked to cached PDF
      const request = new this.carfaxModel({
        id: generateId(),
        ...dto,
        vin: dto.vin.toUpperCase(),
        status: CarfaxRequestStatus.UPLOADED,
        pdfUrl: cached.pdfUrl,
        pdfFilename: cached.pdfFilename,
        uploadedAt: new Date(),
        expiresAt: new Date(Date.now() + this.REPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        estimatedCost: 0, // Free from cache
        actualCost: 0,
        notes: 'Delivered from cache',
      });
      
      await request.save();
      this.logger.log(`Carfax request ${request.id} delivered from cache for VIN ${dto.vin}`);
      return request;
    }

    // Create new pending request
    const request = new this.carfaxModel({
      id: generateId(),
      ...dto,
      vin: dto.vin.toUpperCase(),
      status: CarfaxRequestStatus.PENDING,
      estimatedCost: this.ESTIMATED_COST,
    });

    await request.save();
    this.logger.log(`Carfax request ${request.id} created for VIN ${dto.vin}`);
    
    return request;
  }

  // === USER: GET MY REQUESTS ===
  
  async getUserRequests(userId: string): Promise<any[]> {
    const requests = await this.carfaxModel.find({ userId }).sort({ createdAt: -1 }).lean();
    return requests.map(r => toObjectResponse(r));
  }

  // === USER: GET SINGLE REQUEST ===
  
  async getRequest(requestId: string, userId?: string): Promise<any> {
    const query: any = { id: requestId };
    if (userId) {
      query.userId = userId;
    }

    const request = await this.carfaxModel.findOne(query).lean();
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    // Increment view count
    await this.carfaxModel.updateOne({ id: requestId }, { $inc: { viewCount: 1 } });

    return toObjectResponse(request);
  }

  // === ADMIN: GET QUEUE ===
  
  async getAdminQueue(status?: CarfaxRequestStatus): Promise<any[]> {
    const query: any = {};
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: [CarfaxRequestStatus.PENDING, CarfaxRequestStatus.PROCESSING] };
    }

    const requests = await this.carfaxModel.find(query).sort({ createdAt: 1 }).lean();
    return requests.map(r => toObjectResponse(r));
  }

  // === ADMIN: APPROVE (Start Processing) ===
  
  async approve(requestId: string, managerId: string, managerName: string): Promise<any> {
    const request = await this.carfaxModel.findOne({ id: requestId });
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== CarfaxRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    request.status = CarfaxRequestStatus.PROCESSING;
    request.managerId = managerId;
    request.managerName = managerName;
    request.processedAt = new Date();

    await request.save();
    this.logger.log(`Carfax request ${requestId} approved by ${managerName}`);

    return toObjectResponse(request.toObject());
  }

  // === ADMIN: REJECT ===
  
  async reject(requestId: string, managerId: string, managerName: string, reason: string): Promise<any> {
    const request = await this.carfaxModel.findOne({ id: requestId });
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status === CarfaxRequestStatus.UPLOADED) {
      throw new BadRequestException('Cannot reject an uploaded request');
    }

    request.status = CarfaxRequestStatus.REJECTED;
    request.managerId = managerId;
    request.managerName = managerName;
    request.rejectReason = reason;
    request.rejectedAt = new Date();

    await request.save();
    this.logger.log(`Carfax request ${requestId} rejected by ${managerName}: ${reason}`);

    return toObjectResponse(request.toObject());
  }

  // === ADMIN: UPLOAD PDF ===
  
  async uploadPdf(
    requestId: string, 
    managerId: string, 
    managerName: string,
    pdfUrl: string,
    pdfFilename: string,
    actualCost?: number
  ): Promise<any> {
    const request = await this.carfaxModel.findOne({ id: requestId });
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== CarfaxRequestStatus.PROCESSING && request.status !== CarfaxRequestStatus.PENDING) {
      throw new BadRequestException('Request is not in processing state');
    }

    request.status = CarfaxRequestStatus.UPLOADED;
    request.managerId = managerId;
    request.managerName = managerName;
    request.pdfUrl = pdfUrl;
    request.pdfFilename = pdfFilename;
    request.actualCost = actualCost || this.ESTIMATED_COST;
    request.uploadedAt = new Date();
    request.expiresAt = new Date(Date.now() + this.REPORT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await request.save();
    this.logger.log(`Carfax request ${requestId} PDF uploaded by ${managerName}`);

    return toObjectResponse(request.toObject());
  }

  // === ADMIN: ANALYTICS ===
  
  async getAnalytics(periodDays: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [
      totalRequests,
      pendingRequests,
      processingRequests,
      uploadedRequests,
      rejectedRequests,
      cacheHits,
    ] = await Promise.all([
      this.carfaxModel.countDocuments({ createdAt: { $gte: startDate } }),
      this.carfaxModel.countDocuments({ status: CarfaxRequestStatus.PENDING }),
      this.carfaxModel.countDocuments({ status: CarfaxRequestStatus.PROCESSING }),
      this.carfaxModel.countDocuments({ status: CarfaxRequestStatus.UPLOADED, createdAt: { $gte: startDate } }),
      this.carfaxModel.countDocuments({ status: CarfaxRequestStatus.REJECTED, createdAt: { $gte: startDate } }),
      this.carfaxModel.countDocuments({ actualCost: 0, status: CarfaxRequestStatus.UPLOADED, createdAt: { $gte: startDate } }),
    ]);

    // Cost aggregation
    const costAgg = await this.carfaxModel.aggregate([
      { $match: { status: CarfaxRequestStatus.UPLOADED, createdAt: { $gte: startDate } } },
      { $group: { _id: null, totalCost: { $sum: '$actualCost' } } },
    ]);

    const totalCost = costAgg[0]?.totalCost || 0;
    const costSaved = cacheHits * this.ESTIMATED_COST;

    // By manager aggregation
    const byManager = await this.carfaxModel.aggregate([
      { $match: { managerId: { $exists: true }, createdAt: { $gte: startDate } } },
      { 
        $group: { 
          _id: '$managerId',
          managerName: { $first: '$managerName' },
          processed: { $sum: 1 },
          uploaded: { $sum: { $cond: [{ $eq: ['$status', CarfaxRequestStatus.UPLOADED] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', CarfaxRequestStatus.REJECTED] }, 1, 0] } },
          totalCost: { $sum: '$actualCost' },
        }
      },
      { $sort: { processed: -1 } },
    ]);

    return {
      totalRequests,
      pendingRequests,
      processingRequests,
      uploadedRequests,
      rejectedRequests,
      cacheHits,
      cacheHitRate: totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 100) : 0,
      totalCost,
      costSaved,
      avgCostPerReport: uploadedRequests > 0 ? Math.round(totalCost / uploadedRequests) : 0,
      byManager,
      periodDays,
    };
  }
}
