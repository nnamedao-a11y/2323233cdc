import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { DocumentType, DocumentStatus } from '../enums/document.enum';

export class CreateDocumentDto {
  @IsEnum(DocumentType)
  type: DocumentType;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  dealId?: string;

  @IsOptional()
  @IsString()
  depositId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AttachFilesDto {
  @IsArray()
  @IsString({ each: true })
  fileIds: string[];
}

export class VerifyDocumentDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectDocumentDto {
  @IsString()
  reason: string;
}

export class QueryDocumentsDto {
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  dealId?: string;

  @IsOptional()
  @IsString()
  depositId?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
