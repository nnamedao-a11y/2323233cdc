import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Document } from '../schemas/document.schema';
import { DocumentType, DocumentStatus } from '../enums/document.enum';
import { 
  CreateDocumentDto, 
  UpdateDocumentDto, 
  QueryDocumentsDto,
  AttachFilesDto,
} from '../dto/document.dto';
import { generateId, toObjectResponse, toArrayResponse } from '../../../shared/utils';
import { FilesService } from '../../files/services/files.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction, EntityType, NotificationType } from '../../../shared/enums';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(Document.name) private documentModel: Model<Document>,
    private filesService: FilesService,
    private notificationsService: NotificationsService,
    private auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new document
   */
  async create(dto: CreateDocumentDto, userId: string): Promise<any> {
    const document = new this.documentModel({
      id: generateId(),
      ...dto,
      status: dto.fileIds?.length ? DocumentStatus.UPLOADED : DocumentStatus.DRAFT,
      createdBy: userId,
    });

    const saved = await document.save();

    // Bind files to document
    if (dto.fileIds?.length) {
      for (const fileId of dto.fileIds) {
        await this.filesService.bindToEntity(fileId, 'document', saved.id);
      }
    }

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.CREATE,
      entityType: EntityType.DOCUMENT, // Placeholder
      entityId: saved.id,
      userId,
      details: {
        type: dto.type,
        title: dto.title,
        customerId: dto.customerId,
        depositId: dto.depositId,
      },
    });

    this.logger.log(`Document created: ${saved.id} - ${dto.title}`);

    return toObjectResponse(saved);
  }

  /**
   * Update document
   */
  async update(id: string, dto: UpdateDocumentDto, userId: string): Promise<any> {
    const document = await this.documentModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: { ...dto, updatedBy: userId } },
      { new: true },
    );

    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: EntityType.DOCUMENT,
      entityId: id,
      userId,
      details: dto,
    });

    return toObjectResponse(document);
  }

  /**
   * Attach files to document
   */
  async attachFiles(id: string, dto: AttachFilesDto, userId: string): Promise<any> {
    const document = await this.documentModel.findOne({ id, isDeleted: false });
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    // Add new file IDs
    const existingIds = new Set(document.fileIds);
    const newFileIds = dto.fileIds.filter(fid => !existingIds.has(fid));

    if (newFileIds.length === 0) {
      return toObjectResponse(document);
    }

    // Bind files to document
    for (const fileId of newFileIds) {
      await this.filesService.bindToEntity(fileId, 'document', id);
    }

    // Update document
    document.fileIds.push(...newFileIds);
    
    // Update status if it was draft
    if (document.status === DocumentStatus.DRAFT) {
      document.status = DocumentStatus.UPLOADED;
    }

    document.updatedBy = userId;
    await document.save();

    this.logger.log(`Files attached to document ${id}: ${newFileIds.join(', ')}`);

    return toObjectResponse(document);
  }

  /**
   * Submit document for verification
   */
  async submitForVerification(id: string, userId: string): Promise<any> {
    const document = await this.documentModel.findOne({ id, isDeleted: false });
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    if (document.fileIds.length === 0) {
      throw new BadRequestException('Cannot submit document without files');
    }

    if (document.status === DocumentStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Document already pending verification');
    }

    if (document.status === DocumentStatus.VERIFIED) {
      throw new BadRequestException('Document already verified');
    }

    document.status = DocumentStatus.PENDING_VERIFICATION;
    document.updatedBy = userId;
    await document.save();

    // Notify admins/finance about pending verification
    await this.notificationsService.create({
      userId: 'system', // Will be sent to admins
      type: NotificationType.SYSTEM,
      title: 'Документ на перевірку',
      message: `Документ "${document.title}" потребує перевірки`,
      entityType: 'document',
      entityId: id,
    });

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: EntityType.DOCUMENT,
      entityId: id,
      userId,
      details: { action: 'submit_for_verification' },
    });

    this.logger.log(`Document ${id} submitted for verification`);

    return toObjectResponse(document);
  }

  /**
   * Verify document
   */
  async verify(id: string, note: string | undefined, userId: string): Promise<any> {
    const document = await this.documentModel.findOne({ id, isDeleted: false });
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    if (document.status === DocumentStatus.VERIFIED) {
      throw new BadRequestException('Document already verified');
    }

    document.status = DocumentStatus.VERIFIED;
    document.verifiedBy = userId;
    document.verifiedAt = new Date();
    if (note) {
      document.notes = (document.notes ? document.notes + '\n' : '') + `[Verification] ${note}`;
    }
    document.updatedBy = userId;
    await document.save();

    // Notify document creator
    await this.notificationsService.create({
      userId: document.createdBy,
      type: NotificationType.SYSTEM,
      title: 'Документ підтверджено',
      message: `Документ "${document.title}" успішно підтверджено`,
      entityType: 'document',
      entityId: id,
    });

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: EntityType.DOCUMENT,
      entityId: id,
      userId,
      details: { action: 'verify', note },
    });

    this.logger.log(`Document ${id} verified by ${userId}`);

    return toObjectResponse(document);
  }

  /**
   * Reject document
   */
  async reject(id: string, reason: string, userId: string): Promise<any> {
    const document = await this.documentModel.findOne({ id, isDeleted: false });
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    document.status = DocumentStatus.REJECTED;
    document.rejectionReason = reason;
    document.updatedBy = userId;
    await document.save();

    // Notify document creator
    await this.notificationsService.create({
      userId: document.createdBy,
      type: NotificationType.SYSTEM,
      title: 'Документ відхилено',
      message: `Документ "${document.title}" відхилено: ${reason}`,
      entityType: 'document',
      entityId: id,
    });

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: EntityType.DOCUMENT,
      entityId: id,
      userId,
      details: { action: 'reject', reason },
    });

    this.logger.log(`Document ${id} rejected: ${reason}`);

    return toObjectResponse(document);
  }

  /**
   * Archive document
   */
  async archive(id: string, userId: string): Promise<any> {
    const document = await this.documentModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: { status: DocumentStatus.ARCHIVED, updatedBy: userId } },
      { new: true },
    );

    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    return toObjectResponse(document);
  }

  /**
   * Get document by ID
   */
  async getById(id: string): Promise<any> {
    const document = await this.documentModel.findOne({ id, isDeleted: false });
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    return toObjectResponse(document);
  }

  /**
   * Query documents
   */
  async query(dto: QueryDocumentsDto): Promise<any[]> {
    const filter: any = { isDeleted: false };

    if (dto.type) filter.type = dto.type;
    if (dto.status) filter.status = dto.status;
    if (dto.customerId) filter.customerId = dto.customerId;
    if (dto.leadId) filter.leadId = dto.leadId;
    if (dto.dealId) filter.dealId = dto.dealId;
    if (dto.depositId) filter.depositId = dto.depositId;

    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    const documents = await this.documentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return toArrayResponse(documents);
  }

  /**
   * Get pending verification documents
   */
  async getPendingVerification(): Promise<any[]> {
    const documents = await this.documentModel
      .find({ 
        status: DocumentStatus.PENDING_VERIFICATION, 
        isDeleted: false 
      })
      .sort({ createdAt: 1 }); // Oldest first

    return toArrayResponse(documents);
  }

  /**
   * Get documents by customer
   */
  async getByCustomer(customerId: string): Promise<any[]> {
    const documents = await this.documentModel
      .find({ customerId, isDeleted: false })
      .sort({ createdAt: -1 });

    return toArrayResponse(documents);
  }

  /**
   * Get documents by deal
   */
  async getByDeal(dealId: string): Promise<any[]> {
    const documents = await this.documentModel
      .find({ dealId, isDeleted: false })
      .sort({ createdAt: -1 });

    return toArrayResponse(documents);
  }

  /**
   * Get documents by deposit
   */
  async getByDeposit(depositId: string): Promise<any[]> {
    const documents = await this.documentModel
      .find({ depositId, isDeleted: false })
      .sort({ createdAt: -1 });

    return toArrayResponse(documents);
  }

  /**
   * Create deposit proof document
   */
  async createDepositProof(
    depositId: string,
    customerId: string,
    fileIds: string[],
    userId: string,
  ): Promise<any> {
    return this.create({
      type: DocumentType.DEPOSIT_PROOF,
      title: 'Підтвердження депозиту',
      depositId,
      customerId,
      fileIds,
    }, userId);
  }

  /**
   * Soft delete document
   */
  async delete(id: string, userId: string): Promise<void> {
    const result = await this.documentModel.findOneAndUpdate(
      { id },
      { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: userId } },
    );

    if (!result) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    // Audit log
    await this.auditLogService.log({
      action: AuditAction.DELETE,
      entityType: EntityType.DOCUMENT,
      entityId: id,
      userId,
    });
  }
}
