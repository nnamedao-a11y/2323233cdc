import { IsOptional, IsString, IsNumber, IsEnum, IsBoolean, Min, Max, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { VehicleSource, VehicleStatus } from '../enums/vehicle.enum';

export class VehicleQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // Пошук по VIN, title, make, model

  @IsOptional()
  @IsEnum(VehicleSource)
  source?: VehicleSource;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  yearFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  yearTo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceTo?: number;

  @IsOptional()
  @IsString()
  bodyType?: string;

  @IsOptional()
  @IsString()
  engineType?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasImages?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRunnable?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: string; // price, year, createdAt, lastSyncedAt

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class VehicleStatsDto {
  total: number;
  active: number;
  sold: number;
  reserved: number;
  archived: number;
  newToday: number;
  updatedToday: number;
  bySource: Record<string, number>;
  avgPrice: number;
}
