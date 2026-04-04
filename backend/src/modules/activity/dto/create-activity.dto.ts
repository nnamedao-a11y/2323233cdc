import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../enums/activity-action.enum';

export class CreateActivityDto {
  @IsString()
  userId: string;

  @IsString()
  userRole: string;

  @IsString()
  @IsOptional()
  userName?: string;

  @IsEnum(ActivityAction)
  action: ActivityAction;

  @IsEnum(ActivityEntityType)
  @IsOptional()
  entityType?: ActivityEntityType;

  @IsString()
  @IsOptional()
  entityId?: string;

  @IsObject()
  @IsOptional()
  meta?: {
    fromStatus?: string;
    toStatus?: string;
    duration?: number;
    reason?: string;
    value?: number;
    assignedTo?: string;
    assignedFrom?: string;
    [key: string]: any;
  };

  @IsObject()
  @IsOptional()
  context?: {
    ip?: string;
    userAgent?: string;
    source?: ActivitySource;
    requestId?: string;
  };
}
