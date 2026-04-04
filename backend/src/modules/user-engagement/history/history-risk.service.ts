/**
 * History Risk Service
 * 
 * Оцінка ризику abuse для history requests
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { VehicleHistoryRequest, VehicleHistoryRequestDocument } from './schemas/vehicle-history-request.schema';
import { UserHistoryQuota, UserHistoryQuotaDocument } from './schemas/user-history-quota.schema';
import { Model } from 'mongoose';

// Risk thresholds
const RISK_THRESHOLD_BLOCK = 60;
const RISK_THRESHOLD_WARNING = 40;

@Injectable()
export class HistoryRiskService {
  private readonly logger = new Logger(HistoryRiskService.name);

  constructor(
    @InjectModel(VehicleHistoryRequest.name)
    private readonly requestModel: Model<VehicleHistoryRequestDocument>,
    @InjectModel(UserHistoryQuota.name)
    private readonly quotaModel: Model<UserHistoryQuotaDocument>,
  ) {}

  /**
   * Розрахувати risk score
   */
  async score(userId: string, vin: string, deviceFingerprint: string): Promise<{
    score: number;
    factors: string[];
  }> {
    let score = 0;
    const factors: string[] = [];
    const now = Date.now();

    // Factor 1: Багато requests від цього user за 24h
    const userRecent = await this.requestModel.countDocuments({
      userId,
      createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) },
    });

    if (userRecent >= 5) {
      score += 40;
      factors.push(`high_user_volume: ${userRecent} requests in 24h`);
    } else if (userRecent >= 2) {
      score += 20;
      factors.push(`medium_user_volume: ${userRecent} requests in 24h`);
    }

    // Factor 2: Багато requests з цього device за 24h
    const deviceRecent = await this.requestModel.countDocuments({
      deviceFingerprint,
      createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) },
    });

    if (deviceRecent >= 5) {
      score += 50;
      factors.push(`high_device_volume: ${deviceRecent} from same device`);
    } else if (deviceRecent >= 3) {
      score += 25;
      factors.push(`medium_device_volume: ${deviceRecent} from same device`);
    }

    // Factor 3: Різні users з одного device
    const differentUsersFromDevice = await this.requestModel.distinct('userId', {
      deviceFingerprint,
      createdAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
    });

    if (differentUsersFromDevice.length >= 3) {
      score += 40;
      factors.push(`multiple_accounts: ${differentUsersFromDevice.length} users from device`);
    } else if (differentUsersFromDevice.length >= 2) {
      score += 20;
      factors.push(`dual_accounts: ${differentUsersFromDevice.length} users from device`);
    }

    // Factor 4: Цей VIN вже запитували з цього device
    const sameVinDevice = await this.requestModel.countDocuments({
      vin,
      deviceFingerprint,
      createdAt: { $gte: new Date(now - 6 * 60 * 60 * 1000) },
    });

    if (sameVinDevice >= 1) {
      score += 15;
      factors.push(`repeat_vin_device: same VIN from device recently`);
    }

    // Factor 5: User має abuse flags
    const quota = await this.quotaModel.findOne({ userId });
    if (quota?.abuseFlags && quota.abuseFlags > 0) {
      score += quota.abuseFlags * 10;
      factors.push(`prior_abuse: ${quota.abuseFlags} flags`);
    }

    // Factor 6: Занадто швидкі requests (менше 30 сек)
    const veryRecent = await this.requestModel.countDocuments({
      userId,
      createdAt: { $gte: new Date(now - 30 * 1000) },
    });

    if (veryRecent >= 1) {
      score += 20;
      factors.push(`rapid_requests: ${veryRecent} in last 30s`);
    }

    this.logger.debug(`[Risk] User ${userId}: score=${score}, factors=${factors.join(', ')}`);

    return { score, factors };
  }

  /**
   * Чи блокувати request
   */
  shouldBlock(score: number): boolean {
    return score >= RISK_THRESHOLD_BLOCK;
  }

  /**
   * Чи потрібно попередження
   */
  shouldWarn(score: number): boolean {
    return score >= RISK_THRESHOLD_WARNING && score < RISK_THRESHOLD_BLOCK;
  }

  /**
   * Інкремент abuse flags
   */
  async incrementAbuseFlags(userId: string) {
    await this.quotaModel.findOneAndUpdate(
      { userId },
      { $inc: { abuseFlags: 1 } },
      { upsert: true },
    );
  }
}
