import { IsString } from 'class-validator';

export class RequestHistoryDto {
  @IsString()
  vin: string;
}
