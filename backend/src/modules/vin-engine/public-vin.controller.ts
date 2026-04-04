/**
 * Public VIN Controller
 * 
 * Публічні endpoints для VIN пошуку та створення лідів
 * БЕЗ авторизації - доступ для всіх
 */

import { Controller, Get, Post, Body, Param, Query, Logger, BadRequestException } from '@nestjs/common';
import { VinSearchOrchestratorService, VinSearchOrchestratorResult } from './providers/vin-search-orchestrator.service';
import { CreateVinLeadDto, PublicVinResultDto } from './dto/public-vin.dto';
import { LeadsService } from '../leads/leads.service';
import { LeadSource } from '../../shared/enums';

@Controller('public/vin')
export class PublicVinController {
  private readonly logger = new Logger(PublicVinController.name);

  constructor(
    private readonly vinOrchestrator: VinSearchOrchestratorService,
    private readonly leadsService: LeadsService,
  ) {}

  /**
   * Public VIN search
   * GET /api/public/vin/search?vin=XXXXXXXXXXXXX
   */
  @Get('search')
  async search(@Query('vin') vin: string): Promise<PublicVinResultDto | { success: false; message: string }> {
    this.logger.log(`[Public VIN] Search request: ${vin}`);
    
    if (!vin || vin.length < 11) {
      return { success: false, message: 'VIN має бути не менше 11 символів' };
    }

    const result = await this.vinOrchestrator.search(vin);
    return this.formatPublicResult(result);
  }

  /**
   * Public VIN search by param (SEO-friendly)
   * GET /api/public/vin/:vin
   */
  @Get(':vin')
  async searchByVin(@Param('vin') vin: string): Promise<PublicVinResultDto | { success: false; message: string }> {
    this.logger.log(`[Public VIN] Search by param: ${vin}`);
    
    if (!vin || vin.length < 11) {
      return { success: false, message: 'VIN має бути не менше 11 символів' };
    }

    const result = await this.vinOrchestrator.search(vin);
    return this.formatPublicResult(result);
  }

  /**
   * Create lead from VIN page
   * POST /api/public/vin/lead
   */
  @Post('lead')
  async createLead(@Body() dto: CreateVinLeadDto): Promise<{ success: boolean; leadId?: string; message: string }> {
    this.logger.log(`[Public VIN] Lead creation for VIN: ${dto.vin}`);

    try {
      // Validate VIN format
      const normalizedVin = dto.vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
      if (normalizedVin.length !== 17) {
        throw new BadRequestException('Невалідний VIN код');
      }

      // Get vehicle info if available
      const vinResult = await this.vinOrchestrator.search(normalizedVin);
      const vehicleInfo = vinResult.merged;

      // Build description with vehicle info
      let description = `Запит на авто з VIN: ${normalizedVin}`;
      if (vehicleInfo) {
        const title = vehicleInfo.title || `${vehicleInfo.year || ''} ${vehicleInfo.make || ''} ${vehicleInfo.model || ''}`.trim();
        description += `\n\nАвто: ${title}`;
        if (vehicleInfo.price) description += `\nЦіна: $${vehicleInfo.price.toLocaleString()}`;
        if (vehicleInfo.location) description += `\nЛокація: ${vehicleInfo.location}`;
        if (vehicleInfo.saleDate) description += `\nДата аукціону: ${new Date(vehicleInfo.saleDate).toLocaleDateString('uk-UA')}`;
        if (vehicleInfo.sourceUrl) description += `\nДжерело: ${vehicleInfo.sourceUrl}`;
      }
      if (dto.message) {
        description += `\n\nПовідомлення клієнта: ${dto.message}`;
      }

      // Create lead
      const lead = await this.leadsService.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        source: LeadSource.WEBSITE,
        description,
        value: vehicleInfo?.price || 0,
        tags: ['vin-search', normalizedVin],
      }, 'system', 'system', 'VIN Search Bot');

      this.logger.log(`[Public VIN] Lead created: ${lead.id}`);

      return {
        success: true,
        leadId: lead.id,
        message: 'Ваш запит прийнято! Менеджер зв\'яжеться з вами найближчим часом.',
      };
    } catch (error: any) {
      this.logger.error(`[Public VIN] Lead creation error: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Помилка створення запиту',
      };
    }
  }

  /**
   * Format result for public display
   */
  private formatPublicResult(result: VinSearchOrchestratorResult): PublicVinResultDto | { success: false; message: string } {
    if (!result.success || !result.merged) {
      return {
        success: false,
        message: result.message,
      } as any;
    }

    const vehicle = result.merged;
    
    // Calculate auction countdown
    let auctionCountdown: PublicVinResultDto['auctionCountdown'] = undefined;
    if (vehicle.saleDate) {
      const saleDate = new Date(vehicle.saleDate);
      const now = new Date();
      const diff = saleDate.getTime() - now.getTime();
      
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        auctionCountdown = {
          days,
          hours,
          minutes,
          isExpired: false,
        };
      } else {
        auctionCountdown = {
          days: 0,
          hours: 0,
          minutes: 0,
          isExpired: true,
        };
      }
    }

    // Calculate score (0-100)
    const score = Math.round((vehicle.confidence || 0.5) * 100);

    return {
      vin: vehicle.vin,
      title: vehicle.title,
      price: vehicle.price ?? undefined,
      images: vehicle.images,
      saleDate: vehicle.saleDate ?? undefined,
      isAuction: vehicle.isAuction ?? false,
      auctionCountdown,
      location: vehicle.location,
      lotNumber: vehicle.lotNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      mileage: vehicle.mileage,
      damageType: vehicle.damageType,
      score,
      sourceUrl: vehicle.sourceUrl,
      sources: vehicle.raw?.allSources || [vehicle.sourceName],
    };
  }
}
