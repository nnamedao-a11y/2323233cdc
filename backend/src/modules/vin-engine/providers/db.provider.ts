/**
 * DB VIN Search Provider
 * 
 * Шукає VIN в локальній базі vehicles та auctions
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  VinSearchCandidate,
  VinSearchContext,
  VinSearchProvider,
} from '../interfaces/vin-search-provider.interface';
import { Vehicle } from '../../ingestion/schemas/vehicle.schema';
import { Auction, AuctionDocument } from '../../auction-ranking/auction.schema';

@Injectable()
export class DbVinSearchProvider implements VinSearchProvider {
  readonly name = 'local_db';
  readonly priority = 1; // Highest priority
  private readonly logger = new Logger(DbVinSearchProvider.name);

  constructor(
    @InjectModel(Vehicle.name)
    private readonly vehicleModel: Model<Vehicle>,
    @InjectModel(Auction.name)
    private readonly auctionModel: Model<AuctionDocument>,
  ) {}

  async search(context: VinSearchContext): Promise<VinSearchCandidate[]> {
    const vin = context.vin.trim().toUpperCase();
    const candidates: VinSearchCandidate[] = [];
    
    // Search in vehicles collection
    const vehicle = await this.vehicleModel.findOne({ 
      vin, 
      isDeleted: { $ne: true } 
    }).lean();

    if (vehicle) {
      candidates.push({
        vin: vehicle.vin,
        title: vehicle.title,
        price: vehicle.price,
        images: vehicle.images,
        saleDate: vehicle.auctionDate,
        isAuction: true,
        lotNumber: vehicle.lotNumber,
        location: vehicle.auctionLocation,
        mileage: vehicle.mileage?.toString(),
        make: vehicle.make,
        model: vehicle.vehicleModel,
        year: vehicle.year,
        damageType: vehicle.damageType,
        sourceUrl: vehicle.sourceUrl,
        sourceName: 'local_db_vehicle',
        confidence: 1.0,
        raw: vehicle,
      });
    }

    // Search in auctions collection
    const auction = await this.auctionModel.findOne({ 
      vin,
      isActive: true,
    }).lean();

    if (auction) {
      this.logger.log(`[DB Provider] Found auction for VIN: ${vin}`);
      candidates.push({
        vin: auction.vin,
        title: auction.title || `${auction.year || ''} ${auction.make || ''} ${auction.model || ''}`.trim(),
        price: auction.price,
        images: auction.images || [],
        saleDate: auction.auctionDate,
        isAuction: true,
        lotNumber: auction.lotNumber,
        location: auction.location,
        mileage: auction.mileage?.toString(),
        make: auction.make,
        model: auction.model,
        year: auction.year,
        damageType: auction.damageType,
        sourceUrl: undefined,
        sourceName: `auction_${auction.source}`,
        confidence: auction.confidence || 0.9,
        raw: auction,
      });
    }

    return candidates;
  }
}
