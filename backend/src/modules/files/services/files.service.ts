import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as path from 'path';
import { File, FileEntityType } from '../schemas/file.schema';
import { StorageProviderFactory, StorageType } from '../providers/storage-provider.factory';
import { UploadFileDto, QueryFilesDto } from '../dto/file.dto';
import { 
  ALLOWED_MIME_TYPES, 
  BLOCKED_EXTENSIONS, 
  MAX_FILE_SIZE 
} from '../interfaces/storage-provider.interface';
import { generateId, toObjectResponse, toArrayResponse } from '../../../shared/utils';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction, EntityType } from '../../../shared/enums';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectModel(File.name) private fileModel: Model<File>,
    private storageFactory: StorageProviderFactory,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Upload a file
   */
  async uploadFile(
    file: Express.Multer.File,
    dto: UploadFileDto,
    userId: string,
  ): Promise<any> {
    // Validate file
    this.validateFile(file);

    // Get storage provider
    const provider = this.storageFactory.getProvider();

    // Determine folder based on entity type
    const folder = dto.entityType || 'general';

    // Upload to storage
    const uploadResult = await provider.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder,
    });

    // Create file record
    const fileRecord = new this.fileModel({
      id: generateId(),
      filename: path.basename(uploadResult.storageKey),
      originalName: file.originalname,
      extension: path.extname(file.originalname).toLowerCase(),
      mimeType: file.mimetype,
      size: uploadResult.size,
      storageKey: uploadResult.storageKey,
      bucket: uploadResult.bucket,
      storageProvider: uploadResult.provider,
      uploadedBy: userId,
      relatedTo: dto.entityType && dto.entityId ? {
        entityType: dto.entityType,
        entityId: dto.entityId,
      } : undefined,
      tags: dto.tags || [],
      access: dto.access || 'private',
      metadata: {
        note: dto.note,
        source: 'upload',
      },
    });

    const saved = await fileRecord.save();

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.CREATE,
      entityType: EntityType.FILE,
      entityId: saved.id,
      userId,
      details: {
        filename: file.originalname,
        size: uploadResult.size,
        entityType: dto.entityType,
        entityId: dto.entityId,
      },
    });

    this.logger.log(`File uploaded: ${saved.id} - ${file.originalname}`);

    return toObjectResponse(saved);
  }

  /**
   * Validate file before upload
   */
  private validateFile(file: Express.Multer.File): void {
    // Check size
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }

    // Check extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(`File extension ${ext} is blocked`);
    }
  }

  /**
   * Get file by ID
   */
  async getById(fileId: string): Promise<any> {
    const file = await this.fileModel.findOne({ id: fileId, isDeleted: false });
    if (!file) {
      throw new NotFoundException(`File ${fileId} not found`);
    }
    return toObjectResponse(file);
  }

  /**
   * Get signed URL for file access
   */
  async getSignedUrl(fileId: string, expiresIn: number = 3600): Promise<string> {
    const file = await this.fileModel.findOne({ id: fileId, isDeleted: false });
    if (!file) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    const provider = this.storageFactory.getProvider(file.storageProvider as StorageType);
    return provider.getSignedUrl(file.storageKey, expiresIn);
  }

  /**
   * Delete file (soft delete)
   */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    const file = await this.fileModel.findOne({ id: fileId, isDeleted: false });
    if (!file) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    // Soft delete in DB
    await this.fileModel.findOneAndUpdate(
      { id: fileId },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );

    // Optionally delete from storage (can be done via cleanup job)
    // const provider = this.storageFactory.getProvider(file.storageProvider as StorageType);
    // await provider.delete(file.storageKey);

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.DELETE,
      entityType: EntityType.FILE,
      entityId: fileId,
      userId,
      details: { filename: file.originalName },
    });

    this.logger.log(`File deleted: ${fileId}`);
  }

  /**
   * Bind file to entity
   */
  async bindToEntity(
    fileId: string,
    entityType: FileEntityType,
    entityId: string,
  ): Promise<any> {
    const file = await this.fileModel.findOneAndUpdate(
      { id: fileId, isDeleted: false },
      { $set: { relatedTo: { entityType, entityId } } },
      { new: true },
    );

    if (!file) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    return toObjectResponse(file);
  }

  /**
   * Unbind file from entity
   */
  async unbindFromEntity(fileId: string): Promise<any> {
    const file = await this.fileModel.findOneAndUpdate(
      { id: fileId, isDeleted: false },
      { $unset: { relatedTo: 1 } },
      { new: true },
    );

    if (!file) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    return toObjectResponse(file);
  }

  /**
   * Query files
   */
  async query(dto: QueryFilesDto): Promise<any[]> {
    const filter: any = { isDeleted: false };

    if (dto.entityType && dto.entityId) {
      filter['relatedTo.entityType'] = dto.entityType;
      filter['relatedTo.entityId'] = dto.entityId;
    }

    if (dto.uploadedBy) {
      filter.uploadedBy = dto.uploadedBy;
    }

    if (dto.tags?.length) {
      filter.tags = { $in: dto.tags };
    }

    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    const files = await this.fileModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return toArrayResponse(files);
  }

  /**
   * Get files by entity
   */
  async getByEntity(entityType: FileEntityType, entityId: string): Promise<any[]> {
    const files = await this.fileModel.find({
      'relatedTo.entityType': entityType,
      'relatedTo.entityId': entityId,
      isDeleted: false,
    }).sort({ createdAt: -1 });

    return toArrayResponse(files);
  }

  /**
   * Get file path for serving (local storage only)
   */
  getLocalFilePath(storageKey: string): string {
    return this.storageFactory.getLocalProvider().getFilePath(storageKey);
  }
}
