/**
 * Calculate Delivery DTO
 */

import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CalculateDeliveryDto {
  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  port: string; // NJ, GA, TX, CA

  @IsEnum(['sedan', 'suv', 'bigSUV', 'pickup'])
  vehicleType: 'sedan' | 'suv' | 'bigSUV' | 'pickup';

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsString()
  lotNumber?: string;

  @IsOptional()
  @IsString()
  vehicleTitle?: string;

  @IsOptional()
  @IsString()
  profileCode?: string; // defaults to active profile
}

export class CreateQuoteDto extends CalculateDeliveryDto {
  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(['vin', 'manual', 'admin', 'manager'])
  createdFrom?: 'vin' | 'manual' | 'admin' | 'manager';

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;
}

export class QueryQuotesDto {
  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class SetScenarioDto {
  @IsEnum(['minimum', 'recommended', 'aggressive'])
  selectedScenario: 'minimum' | 'recommended' | 'aggressive';
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  insuranceRate?: number;

  @IsOptional()
  @IsNumber()
  usaHandlingFee?: number;

  @IsOptional()
  @IsNumber()
  bankFee?: number;

  @IsOptional()
  @IsNumber()
  euPortHandlingFee?: number;

  @IsOptional()
  @IsNumber()
  companyFee?: number;

  @IsOptional()
  @IsNumber()
  customsRate?: number;

  @IsOptional()
  @IsNumber()
  hiddenFeeUnder5000?: number;

  @IsOptional()
  @IsNumber()
  hiddenFeeOver5000?: number;

  @IsOptional()
  @IsNumber()
  hiddenFeeThreshold?: number;

  @IsOptional()
  @IsNumber()
  documentationFee?: number;

  @IsOptional()
  @IsNumber()
  titleFee?: number;
}

export class UpsertRouteRateDto {
  @IsString()
  profileCode: string;

  @IsEnum(['usa_inland', 'ocean', 'eu_delivery'])
  rateType: 'usa_inland' | 'ocean' | 'eu_delivery';

  @IsOptional()
  @IsString()
  originCode?: string;

  @IsOptional()
  @IsString()
  destinationCode?: string;

  @IsEnum(['sedan', 'suv', 'bigSUV', 'pickup'])
  vehicleType: 'sedan' | 'suv' | 'bigSUV' | 'pickup';

  @IsNumber()
  @Min(0)
  amount: number;
}

export class UpsertAuctionFeeRuleDto {
  @IsString()
  profileCode: string;

  @IsNumber()
  @Min(0)
  minBid: number;

  @IsNumber()
  @Min(0)
  maxBid: number;

  @IsNumber()
  @Min(0)
  fee: number;

  @IsOptional()
  @IsString()
  description?: string;
}
