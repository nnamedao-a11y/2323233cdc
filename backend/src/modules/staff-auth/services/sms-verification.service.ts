import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { IntegrationConfigService } from '../../integration-config/integration-config.service';
import { IntegrationProvider } from '../../integration-config/schemas/integration-config.schema';

@Injectable()
export class SmsVerificationService {
  private readonly logger = new Logger(SmsVerificationService.name);

  constructor(
    @Inject(forwardRef(() => IntegrationConfigService))
    private readonly integrationConfig: IntegrationConfigService,
  ) {}

  generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async sendSms(phone: string, code: string): Promise<{ success: boolean; debugCode?: string; provider?: string }> {
    this.logger.log(`[SMS] Sending code to ${phone}`);
    
    // Get Twilio config from admin settings
    const twilioConfig = await this.integrationConfig.getConfig(IntegrationProvider.TWILIO);
    
    if (twilioConfig?.isEnabled && twilioConfig.credentials?.accountSid) {
      try {
        const creds = twilioConfig.credentials as { accountSid: string; authToken: string; phoneNumber: string };
        const result = await this.sendViaTwilio(
          phone,
          `Ваш код підтвердження BIBI Cars: ${code}`,
          creds
        );
        
        if (result.success) {
          return { success: true, provider: 'twilio' };
        }
      } catch (error: any) {
        this.logger.error(`Twilio SMS failed: ${error.message}`);
      }
    }

    // Fallback: development mode - return debug code
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV MODE] SMS code for ${phone}: ${code}`);
      return { success: true, debugCode: code, provider: 'debug' };
    }

    // Production without configured SMS provider
    this.logger.warn(`SMS provider not configured - code: ${code}`);
    return { 
      success: false, 
      debugCode: code, // Still return for admin visibility
      provider: 'none' 
    };
  }

  private async sendViaTwilio(
    to: string,
    body: string,
    credentials: { accountSid: string; authToken: string; phoneNumber: string }
  ): Promise<{ success: boolean; messageId?: string }> {
    const { accountSid, authToken, phoneNumber } = credentials;
    
    // Dynamic import to avoid issues if twilio is not installed
    try {
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      
      const message = await client.messages.create({
        body,
        from: phoneNumber,
        to,
      });

      this.logger.log(`Twilio SMS sent: ${message.sid}`);
      return { success: true, messageId: message.sid };
    } catch (error: any) {
      this.logger.error(`Twilio error: ${error.message}`);
      throw error;
    }
  }

  verifyCode(inputCode: string, storedCode: string): boolean {
    return inputCode === storedCode;
  }
}
