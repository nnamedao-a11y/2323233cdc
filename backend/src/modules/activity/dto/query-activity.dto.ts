import { IsString, IsOptional, IsEnum, IsDateString, IsNumber } from 'class-validator';
import { ActivityAction, ActivityEntityType } from '../enums/activity-action.enum';

export class QueryActivityDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsEnum(ActivityAction)
  @IsOptional()
  action?: ActivityAction;

  @IsEnum(ActivityEntityType)
  @IsOptional()
  entityType?: ActivityEntityType;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsNumber()
  @IsOptional()
  page?: number;
}
