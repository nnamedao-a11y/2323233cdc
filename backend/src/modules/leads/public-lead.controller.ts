/**
 * Public Lead Conversion Controller
 * 
 * Публічні endpoints для створення leads з калькулятора (без авторизації)
 */

import { Body, Controller, Post, Get, Param, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead } from './lead.schema';
import { Quote, QuoteDocument } from '../calculator/schemas/quote.schema';
import { generateId } from '../../shared/utils/index';
import { LeadStatus, ContactStatus, LeadSource, AutomationTrigger } from '../../shared/enums/index';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { AutomationService } from '../automation/automation.service';

// DTO for creating lead from quote
class CreateLeadFromQuoteDto {
  @IsString()
  quoteId: string;

  @IsString()
  firstName: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  comment?: string;
}

// DTO for creating lead directly (quick form)
class CreatePublicLeadDto {
  @IsString()
  @IsOptional()
  vin?: string;

  @IsString()
  firstName: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  vehicleTitle?: string;
}

@Controller('public/leads')
export class PublicLeadController {
  private readonly logger = new Logger(PublicLeadController.name);

  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<Lead>,
    @InjectModel(Quote.name) private readonly quoteModel: Model<QuoteDocument>,
    @Inject(forwardRef(() => AutomationService)) private readonly automationService: AutomationService,
  ) {}

  /**
   * Create lead from existing quote (VIN page flow)
   */
  @Post('from-quote')
  async createFromQuote(@Body() dto: CreateLeadFromQuoteDto) {
    this.logger.log(`[Lead] Creating lead from quote: ${dto.quoteId}`);

    try {
      // Get quote data - mongoose should handle string to ObjectId conversion
      const quote = await this.quoteModel.findById(dto.quoteId).lean();
      
      this.logger.log(`[Lead] Quote lookup result: ${quote ? 'found' : 'not found'}`);
      
      if (!quote) {
        return {
          success: false,
          message: 'Quote not found',
        };
      }

    // Create lead
    const lead = await this.leadModel.create({
      id: generateId(),
      firstName: dto.firstName,
      lastName: dto.lastName || '',
      phone: dto.phone,
      email: dto.email || '',
      vin: quote.vin,
      source: LeadSource.WEBSITE,
      status: LeadStatus.NEW,
      contactStatus: ContactStatus.NEW_REQUEST,
      price: quote.visibleTotal,
      metadata: {
        quoteId: String(quote._id),
        quoteNumber: quote.quoteNumber,
        internalTotal: quote.internalTotal,
        hiddenFee: quote.hiddenFee,
        vehicleTitle: quote.vehicleTitle,
        breakdown: quote.breakdown,
        comment: dto.comment || '',
        calculatorInput: quote.input,
        originalSource: 'vin_calculator',
      },
      notes: dto.comment ? `Коментар клієнта: ${dto.comment}` : '',
    });

    // Update quote with lead reference
    await this.quoteModel.findByIdAndUpdate(dto.quoteId, {
      leadId: lead._id,
      status: 'converted',
    });

    this.logger.log(`[Lead] Created lead ${(lead as any).id} from quote ${dto.quoteId}, VIN: ${quote.vin}`);

    return {
      success: true,
      leadId: (lead as any).id,
      message: 'Заявка успішно створена. Менеджер зв\'яжеться з вами найближчим часом.',
      data: {
        id: (lead as any).id,
        vin: (lead as any).vin,
        price: (lead as any).price,
        status: (lead as any).status,
      },
    };
    } catch (error) {
      this.logger.error(`[Lead] Error creating lead from quote: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Error creating lead',
      };
    }
  }

  /**
   * Create lead directly (quick form without quote)
   */
  @Post('quick')
  async createQuickLead(@Body() dto: CreatePublicLeadDto) {
    this.logger.log(`[Lead] Creating quick lead: ${dto.firstName} ${dto.phone}`);

    // Map source string to valid enum or use default
    let source = LeadSource.WEBSITE;
    if (dto.source === 'vin_page_quick') {
      source = LeadSource.WEBSITE;
    }

    const lead = await this.leadModel.create({
      id: generateId(),
      firstName: dto.firstName,
      lastName: dto.lastName || '',
      phone: dto.phone,
      email: dto.email || '',
      vin: dto.vin || '',
      source: source,
      status: LeadStatus.NEW,
      contactStatus: ContactStatus.NEW_REQUEST,
      price: dto.price || 0,
      metadata: {
        vehicleTitle: dto.vehicleTitle || '',
        comment: dto.comment || '',
        originalSource: dto.source,
      },
      notes: dto.comment ? `Коментар клієнта: ${dto.comment}` : '',
    });

    this.logger.log(`[Lead] Created quick lead ${(lead as any).id}`);

    // Trigger automation for lead_created
    try {
      await this.automationService.emit({
        trigger: AutomationTrigger.LEAD_CREATED,
        entityType: 'lead',
        entityId: (lead as any).id,
        data: {
          id: (lead as any).id,
          firstName: dto.firstName,
          lastName: dto.lastName || '',
          phone: dto.phone,
          email: dto.email || '',
          vin: dto.vin || '',
          source: source,
          assignedTo: null,
        },
        userId: 'system',
      });
      this.logger.log(`[Lead] Automation triggered for lead ${(lead as any).id}`);
    } catch (automationError) {
      this.logger.error(`[Lead] Automation trigger failed: ${automationError.message}`);
    }

    return {
      success: true,
      leadId: (lead as any).id,
      message: 'Заявка успішно створена!',
    };
  }

  /**
   * Get lead status (for tracking)
   */
  @Get('status/:leadId')
  async getLeadStatus(@Param('leadId') leadId: string) {
    const lead = await this.leadModel.findOne({ id: leadId }).lean() as any;

    if (!lead) {
      return {
        success: false,
        message: 'Lead not found',
      };
    }

    return {
      success: true,
      data: {
        id: lead.id,
        status: lead.status,
        contactStatus: lead.contactStatus,
        createdAt: lead.createdAt,
      },
    };
  }
}
