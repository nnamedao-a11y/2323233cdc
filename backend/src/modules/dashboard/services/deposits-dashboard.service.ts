import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Deposit } from '../../deposits/deposit.schema';
import { Document } from '../../documents/schemas/document.schema';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { DepositsDashboardMetrics } from '../interfaces/dashboard-response.interface';
import { DepositStatus } from '../../../shared/enums';
import { DocumentStatus, DocumentType } from '../../documents/enums/document.enum';

@Injectable()
export class DepositsDashboardService {
  constructor(
    @InjectModel(Deposit.name) private depositModel: Model<Deposit>,
    @InjectModel(Document.name) private documentModel: Model<Document>,
  ) {}

  async getMetrics(query: DashboardQueryDto): Promise<DepositsDashboardMetrics> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      pendingDepositsData,
      depositsWithoutProof,
      pendingVerification,
      verifiedToday,
      rejectedToday,
    ] = await Promise.all([
      // Pending deposits with total amount
      this.depositModel.aggregate([
        {
          $match: {
            status: DepositStatus.PENDING,
            isDeleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]),

      // Deposits without proof files
      this.depositModel.countDocuments({
        status: { $in: [DepositStatus.PENDING, DepositStatus.CONFIRMED] },
        $or: [
          { proofFiles: { $exists: false } },
          { proofFiles: { $size: 0 } },
        ],
        isDeleted: { $ne: true },
      }),

      // Pending verification documents (deposit_proof type)
      this.documentModel.countDocuments({
        type: DocumentType.DEPOSIT_PROOF,
        status: DocumentStatus.PENDING_VERIFICATION,
        isDeleted: { $ne: true },
      }),

      // Verified today
      this.documentModel.countDocuments({
        type: DocumentType.DEPOSIT_PROOF,
        status: DocumentStatus.VERIFIED,
        verifiedAt: { $gte: todayStart },
        isDeleted: { $ne: true },
      }),

      // Rejected today
      this.documentModel.countDocuments({
        type: DocumentType.DEPOSIT_PROOF,
        status: DocumentStatus.REJECTED,
        updatedAt: { $gte: todayStart },
        isDeleted: { $ne: true },
      }),
    ]);

    const pendingDeposits = pendingDepositsData[0]?.count || 0;
    const totalPendingAmount = pendingDepositsData[0]?.totalAmount || 0;

    return {
      pendingDeposits,
      depositsWithoutProof,
      pendingVerification,
      verifiedToday,
      rejectedToday,
      totalPendingAmount,
    };
  }
}
