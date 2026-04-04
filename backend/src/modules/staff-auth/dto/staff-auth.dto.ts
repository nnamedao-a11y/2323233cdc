import { IsEmail, IsString, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class StaffLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class VerifySmsDto {
  @IsString()
  requestToken: string;

  @IsString()
  code: string;
}

export class ApproveLoginDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DenyLoginDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TerminateSessionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateSecuritySettingsDto {
  @IsOptional()
  @IsEmail()
  approvalEmail?: string;

  @IsOptional()
  @IsBoolean()
  requireOwnerApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  smsRequired?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  sessionLimitPerUser?: number;

  @IsOptional()
  @IsBoolean()
  notifyOnLoginRequest?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnNewDevice?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(120)
  inactivityTimeoutMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  sessionLifetimeHours?: number;
}

export class CheckSessionDto {
  @IsString()
  sessionToken: string;
}
