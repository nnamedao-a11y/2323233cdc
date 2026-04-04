import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Document } from '../../documents/schemas/document.schema';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { DocumentsDashboardMetrics } from '../interfaces/dashboard-response.interface';
import { DocumentStatus } from '../../documents/enums/document.enum';

@Injectable()
export class DocumentsDashboardService {
  constructor(
    @InjectModel(Document.name) private documentModel: Model<Document>,
  ) {}

  async getMetrics(query: DashboardQueryDto): Promise<DocumentsDashboardMetrics> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      pendingVerification,
      rejectedCount,
      uploadedToday,
      archivedCount,
      verifiedToday,
    ] = await Promise.all([
      // Pending verification
      this.documentModel.countDocuments({
        status: DocumentStatus.PENDING_VERIFICATION,
        isDeleted: { $ne: true },
      }),

      // Rejected documents
      this.documentModel.countDocuments({
        status: DocumentStatus.REJECTED,
        isDeleted: { $ne: true },
      }),

      // Uploaded today
      this.documentModel.countDocuments({
        createdAt: { $gte: todayStart },
        isDeleted: { $ne: true },
      }),

      // Archived count
      this.documentModel.countDocuments({
        status: DocumentStatus.ARCHIVED,
        isDeleted: { $ne: true },
      }),

      // Verified today
      this.documentModel.countDocuments({
        status: DocumentStatus.VERIFIED,
        verifiedAt: { $gte: todayStart },
        isDeleted: { $ne: true },
      }),
    ]);

    return {
      pendingVerification,
      rejectedCount,
      uploadedToday,
      archivedCount,
      verifiedToday,
    };
  }
}
