import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';

export class UploadFileDto {
  @IsOptional()
  @IsEnum(['lead', 'customer', 'deal', 'deposit', 'document'])
  entityType?: 'lead' | 'customer' | 'deal' | 'deposit' | 'document';

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsEnum(['private', 'restricted', 'public'])
  access?: 'private' | 'restricted' | 'public';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class BindFileDto {
  @IsString()
  entityType: 'lead' | 'customer' | 'deal' | 'deposit' | 'document';

  @IsString()
  entityId: string;
}

export class QueryFilesDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  uploadedBy?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
