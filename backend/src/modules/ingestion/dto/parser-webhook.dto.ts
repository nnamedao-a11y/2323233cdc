import { IsString, IsOptional, IsNumber, IsArray, IsObject, IsEnum, IsBoolean, IsDateString } from 'class-validator';
import { VehicleSource } from '../enums/vehicle.enum';

/**
 * DTO для Webhook від парсера
 * 
 * POST /api/ingestion/parser/vehicle
 */
export class ParserVehicleDto {
  @IsString()
  externalId: string; // Lot number або ID з джерела

  @IsEnum(VehicleSource)
  source: VehicleSource; // 'copart' | 'iaai' | etc

  @IsString()
  vin: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsArray()
  @IsOptional()
  images?: string[];

  @IsString()
  @IsOptional()
  primaryImage?: string;

  // Розширені поля
  @IsString()
  @IsOptional()
  make?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  year?: number;

  @IsNumber()
  @IsOptional()
  mileage?: number;

  @IsString()
  @IsOptional()
  mileageUnit?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  bodyType?: string;

  @IsString()
  @IsOptional()
  engineType?: string;

  @IsString()
  @IsOptional()
  transmission?: string;

  @IsString()
  @IsOptional()
  drivetrain?: string;

  @IsNumber()
  @IsOptional()
  estimatedRetailValue?: number;

  @IsNumber()
  @IsOptional()
  repairCost?: number;

  @IsString()
  @IsOptional()
  conditionGrade?: string;

  @IsString()
  @IsOptional()
  damageType?: string;

  @IsString()
  @IsOptional()
  damageDescription?: string;

  @IsBoolean()
  @IsOptional()
  hasKeys?: boolean;

  @IsBoolean()
  @IsOptional()
  isRunnable?: boolean;

  @IsDateString()
  @IsOptional()
  auctionDate?: string;

  @IsString()
  @IsOptional()
  auctionLocation?: string;

  @IsString()
  @IsOptional()
  lotNumber?: string;

  @IsString()
  @IsOptional()
  saleStatus?: string;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  // Додаткові метадані
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO для batch import
 */
export class ParserBatchDto {
  @IsArray()
  vehicles: ParserVehicleDto[];

  @IsEnum(VehicleSource)
  source: VehicleSource;
}

/**
 * Response DTO
 */
export class ParserWebhookResponseDto {
  success: boolean;
  vehicleId?: string;
  vin?: string;
  action: 'created' | 'updated' | 'skipped';
  message?: string;
  rawDataId: string;
}

export class ParserBatchResponseDto {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: ParserWebhookResponseDto[];
}
