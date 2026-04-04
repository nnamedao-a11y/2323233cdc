/**
 * Contract PDF Generator
 * 
 * Generates PDF contracts with filled-in data for mediation agreements
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { generateId } from '../../shared/utils';

export interface ContractData {
  // Company/Executor data
  companyName: string;
  companyEik: string;
  companyAddress: string;
  companyRepresentative: string;
  
  // Customer/Client data
  customerName: string;
  customerEgn?: string;
  customerAddress: string;
  customerPhone?: string;
  customerEmail?: string;
  
  // Contract details
  contractNumber: string;
  contractDate: string;
  
  // Vehicle details
  vehicleTitle?: string;
  vin?: string;
  auctionName?: string;
  
  // Financial details
  depositAmount: number;
  depositPercentage: number;
  budget: number;
  currency: string;
  
  // Bank details
  bankName: string;
  bankAccount: string;
}

// Contract template types
export enum ContractTemplate {
  MEDIATION_AGREEMENT = 'mediation_agreement',
  PURCHASE_AGREEMENT = 'purchase_agreement',
  SHIPPING_AGREEMENT = 'shipping_agreement',
}

@Injectable()
export class ContractPdfService {
  private readonly logger = new Logger(ContractPdfService.name);
  private readonly templatesPath: string;

  constructor() {
    this.templatesPath = path.join(__dirname, '../../../assets/templates');
  }

  /**
   * Get template path
   */
  getTemplatePath(template: ContractTemplate): string {
    const templateMap = {
      [ContractTemplate.MEDIATION_AGREEMENT]: 'mediation_agreement.pdf',
      [ContractTemplate.PURCHASE_AGREEMENT]: 'purchase_agreement.pdf',
      [ContractTemplate.SHIPPING_AGREEMENT]: 'shipping_agreement.pdf',
    };
    
    return path.join(this.templatesPath, templateMap[template] || 'mediation_agreement.pdf');
  }

  /**
   * Get base64 of template PDF
   */
  async getTemplateBase64(template: ContractTemplate): Promise<string | null> {
    try {
      const templatePath = this.getTemplatePath(template);
      
      if (!fs.existsSync(templatePath)) {
        this.logger.warn(`Template not found: ${templatePath}`);
        return null;
      }
      
      const fileBuffer = fs.readFileSync(templatePath);
      return fileBuffer.toString('base64');
    } catch (error: any) {
      this.logger.error(`Failed to read template: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate contract number
   */
  generateContractNumber(): string {
    const prefix = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(10000 + Math.random() * 90000);
    return `${prefix}${random}`;
  }

  /**
   * Calculate deposit amount
   */
  calculateDeposit(budget: number, percentage: number = 10, minAmount: number = 2000): number {
    const calculated = budget * (percentage / 100);
    return Math.max(calculated, minAmount);
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number, currency: string = 'BGN'): string {
    return new Intl.NumberFormat('bg-BG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Prepare contract data for mediation agreement
   */
  prepareMediationAgreementData(input: {
    customer: {
      name: string;
      egn?: string;
      address: string;
      phone?: string;
      email?: string;
    };
    deal?: {
      budget: number;
      vehicleTitle?: string;
      vin?: string;
    };
  }): ContractData {
    const budget = input.deal?.budget || 20000;
    
    return {
      // Company (BIBI/PM Auto Group)
      companyName: '„ПМ АВТО ГРУП" ЕООД',
      companyEik: '206637283',
      companyAddress: 'гр. София, бул. Черни връх № 230',
      companyRepresentative: 'Павло Маслов',
      
      // Customer
      customerName: input.customer.name,
      customerEgn: input.customer.egn || '',
      customerAddress: input.customer.address,
      customerPhone: input.customer.phone,
      customerEmail: input.customer.email,
      
      // Contract
      contractNumber: this.generateContractNumber(),
      contractDate: new Date().toLocaleDateString('bg-BG'),
      
      // Vehicle
      vehicleTitle: input.deal?.vehicleTitle,
      vin: input.deal?.vin,
      auctionName: 'Copart / IAAI',
      
      // Financial
      depositAmount: this.calculateDeposit(budget),
      depositPercentage: 10,
      budget,
      currency: 'BGN',
      
      // Bank
      bankName: 'ОББ Банка',
      bankAccount: 'BG13 UBBS 8155 1013 7875 42',
    };
  }

  /**
   * Get contract metadata for display
   */
  getContractDisplayData(data: ContractData): Record<string, any> {
    return {
      title: 'Споразумение за посредничество',
      type: ContractTemplate.MEDIATION_AGREEMENT,
      contractNumber: data.contractNumber,
      date: data.contractDate,
      
      parties: {
        executor: {
          name: data.companyName,
          representative: data.companyRepresentative,
          address: data.companyAddress,
        },
        client: {
          name: data.customerName,
          address: data.customerAddress,
        },
      },
      
      financial: {
        budget: this.formatCurrency(data.budget, data.currency),
        deposit: this.formatCurrency(data.depositAmount, data.currency),
        depositPercentage: `${data.depositPercentage}%`,
      },
      
      bank: {
        name: data.bankName,
        account: data.bankAccount,
      },
      
      vehicle: data.vehicleTitle ? {
        title: data.vehicleTitle,
        vin: data.vin,
      } : null,
    };
  }
}
