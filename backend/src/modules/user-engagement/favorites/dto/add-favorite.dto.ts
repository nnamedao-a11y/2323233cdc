import { IsOptional, IsString } from 'class-validator';

export class AddFavoriteDto {
  @IsString()
  vehicleId: string;

  @IsString()
  vin: string;

  @IsOptional()
  @IsString()
  sourcePage?: string;

  @IsOptional()
  metadataSnapshot?: Record<string, any>;
}
