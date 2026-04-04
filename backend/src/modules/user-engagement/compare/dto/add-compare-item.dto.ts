import { IsOptional, IsString } from 'class-validator';

export class AddCompareItemDto {
  @IsString()
  vehicleId: string;

  @IsString()
  vin: string;

  @IsOptional()
  snapshot?: Record<string, any>;
}
