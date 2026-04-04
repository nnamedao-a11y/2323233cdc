import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Setting } from './setting.schema';
import { toObjectResponse, generateId } from '../../shared/utils';
import { LeadStatus, DealStatus, DepositStatus, LeadSource } from '../../shared/enums';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  
  constructor(@InjectModel(Setting.name) private settingModel: Model<Setting>) {}

  async onModuleInit() {
    await this.bootstrapSettings();
  }

  async bootstrapSettings(): Promise<void> {
    const defaults = [
      { key: 'lead_statuses', value: Object.values(LeadStatus), description: 'Lead pipeline statuses' },
      { key: 'deal_statuses', value: Object.values(DealStatus), description: 'Deal pipeline statuses' },
      { key: 'deposit_statuses', value: Object.values(DepositStatus), description: 'Deposit lifecycle statuses' },
      { key: 'lead_sources', value: Object.values(LeadSource), description: 'Lead sources' },
      // Marketing integrations (sensitive - stored encrypted)
      { key: 'meta_access_token', value: '', description: 'Meta Ads API access token', sensitive: true },
      { key: 'meta_ad_account_id', value: '', description: 'Meta Ad Account ID (act_XXX)', sensitive: false },
      { key: 'fb_pixel_id', value: '', description: 'Facebook Pixel ID', sensitive: false },
      { key: 'fb_access_token', value: '', description: 'Facebook CAPI access token', sensitive: true },
    ];

    for (const setting of defaults) {
      const exists = await this.settingModel.findOne({ key: setting.key });
      if (!exists) {
        await this.settingModel.create({ id: generateId(), ...setting });
      }
    }
  }

  async findAll(): Promise<any[]> {
    const settings = await this.settingModel.find();
    return settings.map(s => {
      const obj = toObjectResponse(s);
      // Mask sensitive values
      if (obj.sensitive && obj.value) {
        obj.value = obj.value.length > 8 ? '***' + obj.value.slice(-4) : '***configured***';
        obj.isConfigured = true;
      }
      return obj;
    });
  }

  async findByKey(key: string): Promise<any> {
    const setting = await this.settingModel.findOne({ key });
    return setting ? toObjectResponse(setting) : null;
  }

  /**
   * Get raw value (for internal use by services)
   */
  async getRawValue(key: string): Promise<string> {
    const setting = await this.settingModel.findOne({ key });
    return setting?.value || '';
  }

  async update(key: string, value: any): Promise<any> {
    this.logger.log(`Updating setting: ${key}`);
    const setting = await this.settingModel.findOneAndUpdate(
      { key },
      { $set: { value } },
      { new: true, upsert: true },
    );
    return toObjectResponse(setting);
  }

  /**
   * Get all marketing integration settings (raw values for services)
   */
  async getMarketingIntegrations(): Promise<{
    metaAccessToken: string;
    metaAdAccountId: string;
    fbPixelId: string;
    fbAccessToken: string;
  }> {
    const [metaAccessToken, metaAdAccountId, fbPixelId, fbAccessToken] = await Promise.all([
      this.getRawValue('meta_access_token'),
      this.getRawValue('meta_ad_account_id'),
      this.getRawValue('fb_pixel_id'),
      this.getRawValue('fb_access_token'),
    ]);

    return {
      metaAccessToken,
      metaAdAccountId,
      fbPixelId,
      fbAccessToken,
    };
  }
}
