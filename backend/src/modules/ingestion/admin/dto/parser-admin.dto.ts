/**
 * Parser Admin DTOs
 */

import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum, Min, Max } from 'class-validator';

export class UpdateParserSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsNumber()
  @Min(5000)
  @Max(120000)
  timeoutMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsBoolean()
  useProxies?: boolean;

  @IsOptional()
  @IsBoolean()
  useFingerprint?: boolean;

  @IsOptional()
  @IsBoolean()
  useCircuitBreaker?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxPages?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  scrollCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(10000)
  waitTimeMs?: number;

  @IsOptional()
  @IsBoolean()
  autoRestartOnFailure?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  autoRestartFailureThreshold?: number;

  @IsOptional()
  @IsBoolean()
  saveRawPayloads?: boolean;

  @IsOptional()
  @IsBoolean()
  enableAlerts?: boolean;
}

export class RunParserDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class QueryParserLogsDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  level?: 'info' | 'warn' | 'error';

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AddProxyDto {
  @IsString()
  server: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsNumber()
  priority?: number;
}

export class UpdateProxyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;
}
