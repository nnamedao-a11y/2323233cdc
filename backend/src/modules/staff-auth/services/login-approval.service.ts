import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ApprovalEmailData {
  to: string;
  userEmail: string;
  userName: string;
  role: string;
  ip: string;
  userAgent: string;
  deviceName?: string;
  approveUrl: string;
  denyUrl: string;
  requestToken: string;
}

@Injectable()
export class LoginApprovalService {
  private readonly logger = new Logger(LoginApprovalService.name);

  constructor(private readonly configService: ConfigService) {}

  buildApprovalUrls(token: string): { approveUrl: string; denyUrl: string } {
    const baseUrl = this.configService.get('BASE_URL') || 
                    this.configService.get('REACT_APP_BACKEND_URL') ||
                    'http://localhost:8001';
    
    return {
      approveUrl: `${baseUrl}/api/staff-auth/approve/${token}`,
      denyUrl: `${baseUrl}/api/staff-auth/deny/${token}`,
    };
  }

  async sendApprovalEmail(data: ApprovalEmailData): Promise<{ success: boolean; preview?: string }> {
    // TODO: Integrate real email provider (SendGrid, etc.)
    
    const emailContent = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 STAFF LOGIN APPROVAL REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User: ${data.userName} (${data.userEmail})
Role: ${data.role.toUpperCase()}
IP: ${data.ip}
Device: ${data.deviceName || data.userAgent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ APPROVE: ${data.approveUrl}
❌ DENY: ${data.denyUrl}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This request will expire in 10 minutes.
    `;

    this.logger.log(`[EMAIL] Sending approval request to ${data.to}`);
    this.logger.debug(emailContent);

    // For development - log the email
    if (process.env.NODE_ENV !== 'production') {
      return { success: true, preview: emailContent };
    }

    // Production: send actual email
    // await this.emailService.send({ to: data.to, subject: 'Staff Login Approval', body: emailContent });
    
    return { success: true };
  }

  async sendLoginNotification(to: string, event: string, details: Record<string, any>): Promise<void> {
    this.logger.log(`[NOTIFICATION] ${event} - ${JSON.stringify(details)}`);
    // TODO: Send notification email/push
  }
}
