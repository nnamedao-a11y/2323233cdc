import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SecuritySettings, SecuritySettingsDocument } from '../schemas/security-settings.schema';
import { UpdateSecuritySettingsDto } from '../dto/staff-auth.dto';

@Injectable()
export class SecuritySettingsService implements OnModuleInit {
  private readonly logger = new Logger(SecuritySettingsService.name);
  private cachedSettings: SecuritySettings | null = null;

  constructor(
    @InjectModel(SecuritySettings.name) 
    private readonly settingsModel: Model<SecuritySettingsDocument>,
  ) {}

  async onModuleInit() {
    await this.ensureDefaults();
  }

  private async ensureDefaults(): Promise<void> {
    const existing = await this.settingsModel.findOne({ key: 'singleton' });
    if (!existing) {
      await this.settingsModel.create({
        key: 'singleton',
        approvalEmail: 'admin@crm.com',
        requireOwnerApproval: true,
        smsRequired: true,
        sessionLimitPerUser: 2,
        notifyOnLoginRequest: true,
        notifyOnNewDevice: true,
        inactivityTimeoutMinutes: 30,
        sessionLifetimeHours: 8,
        smsCodeExpiryMinutes: 5,
        loginRequestExpiryMinutes: 10,
      });
      this.logger.log('✅ Created default security settings');
    }
  }

  async getSettings(): Promise<SecuritySettings> {
    if (this.cachedSettings) return this.cachedSettings;
    
    const settings = await this.settingsModel.findOne({ key: 'singleton' });
    if (settings) {
      this.cachedSettings = settings;
    }
    return settings || this.getDefaultSettings();
  }

  async updateSettings(dto: UpdateSecuritySettingsDto): Promise<SecuritySettings> {
    const updated = await this.settingsModel.findOneAndUpdate(
      { key: 'singleton' },
      { $set: dto },
      { new: true, upsert: true },
    );
    this.cachedSettings = updated;
    return updated;
  }

  private getDefaultSettings(): SecuritySettings {
    return {
      key: 'singleton',
      approvalEmail: 'admin@crm.com',
      requireOwnerApproval: true,
      smsRequired: true,
      sessionLimitPerUser: 2,
      notifyOnLoginRequest: true,
      notifyOnNewDevice: true,
      inactivityTimeoutMinutes: 30,
      sessionLifetimeHours: 8,
      smsCodeExpiryMinutes: 5,
      loginRequestExpiryMinutes: 10,
    } as SecuritySettings;
  }

  clearCache(): void {
    this.cachedSettings = null;
  }
}
