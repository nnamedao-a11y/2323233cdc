import { Injectable, BadRequestException, Inject, forwardRef, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Deposit } from './deposit.schema';
import { toObjectResponse, toArrayResponse, generateId } from '../../shared/utils';
import { DEPOSIT_STATUS_TRANSITIONS } from '../../shared/constants/permissions';
import { DepositStatus, NotificationType } from '../../shared/enums';
import { PaginatedResult } from '../../shared/dto/pagination.dto';
import { DocumentsService } from '../documents/services/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/services/activity.service';
import { ActivityAction, ActivityEntityType, ActivitySource } from '../activity/enums/activity-action.enum';
import { DomainEventsService } from '../../infrastructure/events/domain-events.service';

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    @InjectModel(Deposit.name) private depositModel: Model<Deposit>,
    @Inject(forwardRef(() => DocumentsService)) private documentsService: DocumentsService,
    @Inject(forwardRef(() => NotificationsService)) private notificationsService: NotificationsService,
    private activityService: ActivityService,
    @Optional() private domainEvents: DomainEventsService,
  ) {}

  async create(data: any, userId: string, userRole?: string, userName?: string): Promise<any> {
    const deposit = new this.depositModel({
      id: generateId(),
      ...data,
      proofRequired: true,
      proofDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 години на proof
      createdBy: userId,
    });
    const saved = await deposit.save();
    const result = toObjectResponse(saved);

    // Activity log
    this.activityService.logAsync({
      userId,
      userRole: userRole || 'unknown',
      userName,
      action: ActivityAction.DEPOSIT_CREATED,
      entityType: ActivityEntityType.DEPOSIT,
      entityId: result.id,
      meta: { amount: data.amount, customerId: data.customerId },
      context: { source: ActivitySource.WEB },
    });

    // Auto-create document request for deposit proof
    try {
      await this.documentsService.create({
        type: 'deposit_proof' as any, // DocumentType.DEPOSIT_PROOF
        title: `Підтвердження депозиту #${result.id.slice(-8)}`,
        description: `Необхідно завантажити підтвердження оплати для депозиту на суму ${data.amount}`,
        depositId: result.id,
        customerId: data.customerId,
      }, userId);
      this.logger.log(`Created deposit_proof document request for deposit ${result.id}`);
    } catch (error) {
      this.logger.error(`Failed to create deposit_proof document: ${error.message}`);
    }

    // Notify finance team
    await this.notifyFinanceTeam(result, 'Новий депозит потребує підтвердження');

    // Emit domain event for Customer 360 orchestration
    if (this.domainEvents) {
      this.domainEvents.emitDepositCreated({
        depositId: result.id,
        dealId: data.dealId,
        customerId: data.customerId,
        amount: data.amount,
        managerId: data.managerId,
      });
    }

    return result;
  }

  async findAll(query: any): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', status, customerId, dealId } = query;

    const filter: any = { isDeleted: false };
    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (dealId) filter.dealId = dealId;

    const [deposits, total] = await Promise.all([
      this.depositModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.depositModel.countDocuments(filter),
    ]);

    return {
      data: toArrayResponse(deposits),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string): Promise<any> {
    const deposit = await this.depositModel.findOne({ id, isDeleted: false });
    return deposit ? toObjectResponse(deposit) : null;
  }

  async update(id: string, data: any, userId?: string, userRole?: string, userName?: string): Promise<any> {
    if (data.status) {
      const current = await this.depositModel.findOne({ id, isDeleted: false });
      if (current) {
        const allowed: string[] = DEPOSIT_STATUS_TRANSITIONS[current.status as keyof typeof DEPOSIT_STATUS_TRANSITIONS] || [];
        if (!allowed.includes(data.status)) {
          throw new BadRequestException(`Cannot transition from ${current.status} to ${data.status}`);
        }
      }
    }

    const deposit = await this.depositModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: data },
      { new: true },
    );

    if (deposit && userId) {
      this.activityService.logAsync({
        userId,
        userRole: userRole || 'unknown',
        userName,
        action: ActivityAction.DEPOSIT_CREATED, // TODO: add DEPOSIT_UPDATED
        entityType: ActivityEntityType.DEPOSIT,
        entityId: id,
        context: { source: ActivitySource.WEB },
      });
    }

    return deposit ? toObjectResponse(deposit) : null;
  }

  async approve(id: string, userId: string, userRole?: string, userName?: string): Promise<any> {
    const deposit = await this.depositModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: { status: DepositStatus.CONFIRMED, approvedBy: userId, approvedAt: new Date() } },
      { new: true },
    );
    
    if (deposit) {
      const result = toObjectResponse(deposit);
      
      // Activity log
      this.activityService.logAsync({
        userId,
        userRole: userRole || 'unknown',
        userName,
        action: ActivityAction.DEPOSIT_CONFIRMED,
        entityType: ActivityEntityType.DEPOSIT,
        entityId: id,
        meta: { amount: deposit.amount },
        context: { source: ActivitySource.WEB },
      });

      // Emit domain event for Customer 360 orchestration
      if (this.domainEvents) {
        this.domainEvents.emitDepositConfirmed({
          depositId: id,
          amount: deposit.amount,
          managerId: (deposit as any).managerId,
        });
      }

      // Update related document to verified
      try {
        const docs = await this.documentsService.getByDeposit(id);
        if (docs && docs.length > 0) {
          const proofDoc = docs.find((d: any) => d.type === 'deposit_proof');
          if (proofDoc) {
            await this.documentsService.verify(proofDoc.id, 'Deposit approved', userId);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to verify deposit_proof document: ${error.message}`);
      }

      return result;
    }
    return null;
  }

  async complete(id: string, userId: string, userRole?: string, userName?: string): Promise<any> {
    const deposit = await this.depositModel.findOneAndUpdate(
      { id, isDeleted: false, status: DepositStatus.CONFIRMED },
      { $set: { status: DepositStatus.COMPLETED, confirmedAt: new Date() } },
      { new: true },
    );
    
    if (deposit) {
      this.activityService.logAsync({
        userId,
        userRole: userRole || 'unknown',
        userName,
        action: ActivityAction.DEPOSIT_COMPLETED,
        entityType: ActivityEntityType.DEPOSIT,
        entityId: id,
        meta: { amount: deposit.amount },
        context: { source: ActivitySource.WEB },
      });
    }

    return deposit ? toObjectResponse(deposit) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.depositModel.findOneAndUpdate({ id }, { $set: { isDeleted: true } });
    return !!result;
  }

  async getStats(): Promise<any> {
    const [total, byStatus, totalAmount, pendingWithoutProof] = await Promise.all([
      this.depositModel.countDocuments({ isDeleted: false }),
      this.depositModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      this.depositModel.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.depositModel.countDocuments({ 
        isDeleted: false, 
        status: DepositStatus.PENDING,
        proofFiles: { $size: 0 }
      }),
    ]);

    return {
      total,
      totalAmount: totalAmount[0]?.total || 0,
      pendingWithoutProof,
      byStatus: byStatus.reduce((acc, { _id, count, amount }) => ({ ...acc, [_id]: { count, amount } }), {}),
    };
  }

  // Notify finance team about new deposits
  private async notifyFinanceTeam(deposit: any, message: string) {
    // В реальному проекті тут буде запит до users з роллю finance
    // Поки що просто логуємо
    this.logger.log(`Finance notification: ${message} - Deposit #${deposit.id}, Amount: ${deposit.amount}`);
  }

  // Check deposits without proof (for cron)
  async checkDepositsWithoutProof(): Promise<any[]> {
    const deadline = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 години тому
    
    const overdueDeposits = await this.depositModel.find({
      isDeleted: false,
      status: DepositStatus.PENDING,
      proofFiles: { $size: 0 },
      createdAt: { $lt: deadline },
    }).exec();

    return toArrayResponse(overdueDeposits);
  }
}
