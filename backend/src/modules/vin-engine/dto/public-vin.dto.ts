/**
 * Public VIN DTOs
 * 
 * DTOs для публічних API endpoints
 */

import { IsString, IsEmail, IsOptional, Length, IsPhoneNumber, MinLength } from 'class-validator';

export class CreateVinLeadDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10)
  phone: string;

  @IsString()
  @Length(17, 17)
  vin: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class PublicVinSearchDto {
  @IsString()
  @Length(11, 17)
  vin: string;
}

export class PublicVinResultDto {
  vin: string;
  title?: string;
  price?: number;
  images?: string[];
  saleDate?: Date;
  isAuction: boolean;
  auctionCountdown?: {
    days: number;
    hours: number;
    minutes: number;
    isExpired: boolean;
  };
  location?: string;
  lotNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: string;
  damageType?: string;
  score: number;
  sourceUrl?: string;
  sources?: string[];
}
