import { IsString, IsOptional, IsEnum, IsNumber, IsArray, IsBoolean } from 'class-validator';
import { AssignmentStrategy } from '../enums/assignment.enum';

export class CreateRoutingRuleDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  market?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  leadType?: string;

  @IsOptional()
  @IsEnum(AssignmentStrategy)
  strategy?: AssignmentStrategy;

  @IsOptional()
  @IsNumber()
  maxActiveLeadsPerManager?: number;

  @IsOptional()
  @IsNumber()
  maxOpenTasksPerManager?: number;

  @IsOptional()
  @IsBoolean()
  onlyAvailableManagers?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRoleKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedMarkets?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedLanguages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedSources?: string[];

  @IsOptional()
  @IsString()
  fallbackManagerId?: string;

  @IsOptional()
  @IsBoolean()
  useFallbackQueue?: boolean;

  @IsOptional()
  @IsNumber()
  firstResponseSlaMinutes?: number;
}

export class UpdateRoutingRuleDto extends CreateRoutingRuleDto {}

export class AssignLeadDto {
  @IsOptional()
  @IsEnum(AssignmentStrategy)
  strategy?: AssignmentStrategy;

  @IsOptional()
  @IsString()
  forceManagerId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReassignLeadDto {
  @IsString()
  newManagerId: string;

  @IsString()
  reason: string;
}

export class ResolveFallbackDto {
  @IsString()
  managerId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class QueryAssignmentHistoryDto {
  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsEnum(AssignmentStrategy)
  strategy?: AssignmentStrategy;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
