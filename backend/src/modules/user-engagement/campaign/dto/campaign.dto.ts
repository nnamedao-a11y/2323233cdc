/**
 * Engagement Campaign DTO
 */

import { IsString, IsEnum, IsOptional, IsNumber, IsBoolean, Min, Max, MaxLength } from 'class-validator';

export enum CampaignChannel {
  SMS = 'sms',
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
}

export class CreateCampaignDto {
  @IsString()
  vin: string;

  @IsEnum(CampaignChannel)
  channel: CampaignChannel;

  @IsString()
  @MaxLength(500)
  message: string;

  @IsOptional()
  @IsBoolean()
  filterFavorites?: boolean;

  @IsOptional()
  @IsBoolean()
  filterCompare?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  intentMin?: number;

  @IsOptional()
  @IsBoolean()
  onlyHot?: boolean;
}

export class CampaignTemplateDto {
  @IsString()
  templateId: string;

  @IsString()
  vin: string;

  @IsEnum(CampaignChannel)
  channel: CampaignChannel;
}
