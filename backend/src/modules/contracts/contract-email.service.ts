/**
 * Contract Email Service
 * 
 * Sends signed contracts via email to customer and manager
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

export interface ContractEmailData {
  contractId: string;
  contractNumber?: string;
  contractTitle: string;
  vehicleTitle?: string;
  price?: number;
  currency?: string;
  signedAt: Date;
  signatureImageBase64?: string;
  
  // Customer details
  customerName: string;
  customerEmail: string;
  
  // Manager details
  managerName?: string;
  managerEmail?: string;
}

@Injectable()
export class ContractEmailService {
  private readonly logger = new Logger(ContractEmailService.name);
  private resendApiKey: string;
  private senderEmail: string;
  private companyName: string;

  constructor(
    private configService: ConfigService,
    @InjectModel('User') private userModel: Model<any>,
  ) {
    this.resendApiKey = this.configService.get('RESEND_API_KEY') || '';
    this.senderEmail = this.configService.get('SENDER_EMAIL') || 'contracts@bibicars.com';
    this.companyName = 'BIBI Cars';
  }

  /**
   * Send signed contract notification to customer
   */
  async sendToCustomer(data: ContractEmailData): Promise<{ success: boolean; error?: string }> {
    const html = this.generateCustomerEmailHtml(data);
    
    return this.sendEmail(
      data.customerEmail,
      `✅ Контракт підписано - ${data.contractTitle}`,
      html,
    );
  }

  /**
   * Send signed contract notification to manager
   */
  async sendToManager(data: ContractEmailData): Promise<{ success: boolean; error?: string }> {
    if (!data.managerEmail) {
      this.logger.warn('No manager email provided');
      return { success: false, error: 'No manager email' };
    }

    const html = this.generateManagerEmailHtml(data);
    
    return this.sendEmail(
      data.managerEmail,
      `📋 Клієнт підписав контракт - ${data.customerName}`,
      html,
    );
  }

  /**
   * Send to both customer and manager
   */
  async sendSignedContractEmails(data: ContractEmailData): Promise<{
    customerSent: boolean;
    managerSent: boolean;
  }> {
    const [customerResult, managerResult] = await Promise.all([
      this.sendToCustomer(data),
      data.managerEmail ? this.sendToManager(data) : Promise.resolve({ success: false }),
    ]);

    this.logger.log(`Contract emails sent - Customer: ${customerResult.success}, Manager: ${managerResult.success}`);

    return {
      customerSent: customerResult.success,
      managerSent: managerResult.success,
    };
  }

  /**
   * Get manager email by ID
   */
  async getManagerEmail(managerId: string): Promise<string | null> {
    try {
      const manager = await this.userModel.findOne({ id: managerId }).lean() as any;
      return manager?.email || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Send email via Resend API
   */
  private async sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
    if (!this.resendApiKey) {
      this.logger.warn('RESEND_API_KEY not configured, logging email instead');
      this.logger.log(`[EMAIL MOCK] To: ${to}, Subject: ${subject}`);
      return { success: true }; // Return success in dev mode
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${this.companyName} <${this.senderEmail}>`,
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      this.logger.log(`Email sent to ${to}: ${result.id}`);
      
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate customer email HTML
   */
  private generateCustomerEmailHtml(data: ContractEmailData): string {
    const signedDate = new Date(data.signedAt).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .header .check { font-size: 48px; margin-bottom: 12px; }
    .content { padding: 32px; }
    .success-badge { background: #dcfce7; color: #166534; padding: 12px 24px; border-radius: 8px; display: inline-block; font-weight: 600; margin-bottom: 24px; }
    .contract-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .contract-card h3 { margin: 0 0 12px 0; color: #1e293b; }
    .contract-card p { margin: 4px 0; color: #64748b; }
    .price { font-size: 24px; font-weight: 700; color: #1e293b; margin-top: 12px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .info-label { color: #64748b; }
    .info-value { color: #1e293b; font-weight: 500; }
    .footer { background: #f8fafc; padding: 24px 32px; text-align: center; color: #64748b; font-size: 14px; }
    .footer a { color: #3b82f6; text-decoration: none; }
    .btn { display: inline-block; background: #3b82f6; color: #fff !important; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="check">✅</div>
      <h1>Контракт успішно підписано!</h1>
    </div>
    
    <div class="content">
      <div class="success-badge">Документ підписано електронним підписом</div>
      
      <p>Шановний(а) <strong>${data.customerName}</strong>,</p>
      
      <p>Ваш контракт було успішно підписано. Нижче наведено деталі угоди:</p>
      
      <div class="contract-card">
        <h3>${data.contractTitle}</h3>
        ${data.contractNumber ? `<p><strong>№ Договору:</strong> ${data.contractNumber}</p>` : ''}
        ${data.vehicleTitle ? `<p><strong>Авто:</strong> ${data.vehicleTitle}</p>` : ''}
        ${data.price ? `<div class="price">${data.currency === 'BGN' ? 'лв.' : '$'}${data.price.toLocaleString()}</div>` : ''}
      </div>
      
      <div class="info-row">
        <span class="info-label">Дата підпису:</span>
        <span class="info-value">${signedDate}</span>
      </div>
      
      <div class="info-row">
        <span class="info-label">Статус:</span>
        <span class="info-value" style="color: #16a34a;">✓ Підписано</span>
      </div>
      
      <p style="margin-top: 24px;">Ви можете переглянути всі ваші контракти в особистому кабінеті:</p>
      
      <a href="https://bibicars.com/cabinet/contracts" class="btn">Відкрити кабінет</a>
      
      <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
        Якщо у вас виникли питання, будь ласка, зв'яжіться з вашим менеджером.
      </p>
    </div>
    
    <div class="footer">
      <p><strong>BIBI Cars</strong></p>
      <p>Авто з аукціонів США та Європи</p>
      <p><a href="https://bibicars.com">bibicars.com</a></p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate manager email HTML
   */
  private generateManagerEmailHtml(data: ContractEmailData): string {
    const signedDate = new Date(data.signedAt).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: #16a34a; padding: 24px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; }
    .content { padding: 24px; }
    .alert { background: #dcfce7; border-left: 4px solid #16a34a; padding: 16px; margin-bottom: 20px; }
    .contract-info { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .label { color: #64748b; }
    .value { color: #1e293b; font-weight: 500; }
    .footer { background: #f8fafc; padding: 16px 24px; text-align: center; color: #64748b; font-size: 12px; }
    .btn { display: inline-block; background: #3b82f6; color: #fff !important; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Клієнт підписав контракт</h1>
    </div>
    
    <div class="content">
      <div class="alert">
        <strong>✅ Новий підписаний контракт</strong><br>
        Клієнт ${data.customerName} підписав контракт "${data.contractTitle}"
      </div>
      
      <div class="contract-info">
        <div class="row">
          <span class="label">Клієнт:</span>
          <span class="value">${data.customerName}</span>
        </div>
        <div class="row">
          <span class="label">Email:</span>
          <span class="value">${data.customerEmail}</span>
        </div>
        <div class="row">
          <span class="label">Контракт:</span>
          <span class="value">${data.contractTitle}</span>
        </div>
        ${data.contractNumber ? `
        <div class="row">
          <span class="label">Номер:</span>
          <span class="value">${data.contractNumber}</span>
        </div>
        ` : ''}
        ${data.vehicleTitle ? `
        <div class="row">
          <span class="label">Авто:</span>
          <span class="value">${data.vehicleTitle}</span>
        </div>
        ` : ''}
        ${data.price ? `
        <div class="row">
          <span class="label">Сума:</span>
          <span class="value" style="font-weight: 700;">${data.currency === 'BGN' ? 'лв.' : '$'}${data.price.toLocaleString()}</span>
        </div>
        ` : ''}
        <div class="row">
          <span class="label">Дата підпису:</span>
          <span class="value">${signedDate}</span>
        </div>
      </div>
      
      <p style="text-align: center;">
        <a href="https://bibicars.com/admin/contracts/accounting" class="btn">Переглянути в CRM</a>
      </p>
    </div>
    
    <div class="footer">
      <p>BIBI Cars CRM - Автоматичне сповіщення</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}
