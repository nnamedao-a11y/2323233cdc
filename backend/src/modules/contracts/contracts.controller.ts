/**
 * Contracts Controller
 * 
 * Routes:
 * POST /api/contracts/create           - Create contract
 * POST /api/contracts/:id/send         - Send for signing
 * POST /api/contracts/:id/sign         - Sign contract
 * POST /api/contracts/:id/reject       - Reject contract
 * GET  /api/contracts/me               - User's contracts
 * GET  /api/contracts/:id              - Get contract
 * GET  /api/contracts/deal/:dealId     - Deal contracts
 * GET  /api/contracts/template/:type   - Get PDF template
 * GET  /api/admin/contracts/pending    - Pending contracts (admin)
 * GET  /api/admin/contracts/analytics  - Analytics (admin)
 * GET  /api/admin/contracts/accounting - Accounting overview (signatures control)
 */

import { Controller, Get, Post, Body, Param, Query, Req, Res, Header } from '@nestjs/common';
import { Response } from 'express';
import { ContractsService, CreateContractDto } from './contracts.service';
import { ContractPdfService, ContractTemplate } from './contract-pdf.service';
import * as fs from 'fs';

@Controller()
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly pdfService: ContractPdfService,
  ) {}

  // === CREATE CONTRACT ===
  
  @Post('contracts/create')
  async createContract(@Body() body: CreateContractDto, @Req() req: any) {
    const createdBy = req.user?.id;
    return this.contractsService.createContract(body, createdBy);
  }

  // === SEND FOR SIGNING ===
  
  @Post('contracts/:id/send')
  async sendContract(
    @Param('id') id: string,
    @Body() body: { originUrl: string }
  ) {
    return this.contractsService.sendContract(id, body.originUrl);
  }

  // === VIEW CONTRACT ===
  
  @Post('contracts/:id/view')
  async viewContract(@Param('id') id: string) {
    return this.contractsService.markViewed(id);
  }

  // === SIGN CONTRACT ===
  
  @Post('contracts/:id/sign')
  async signContract(
    @Param('id') id: string,
    @Body() body: { signatureData?: any }
  ) {
    return this.contractsService.signContract(id, body.signatureData);
  }

  // === REJECT CONTRACT ===
  
  @Post('contracts/:id/reject')
  async rejectContract(
    @Param('id') id: string,
    @Body() body: { reason?: string }
  ) {
    return this.contractsService.rejectContract(id, body.reason);
  }

  // === CHECK IF SIGNED ===
  
  @Get('contracts/check-signed/:dealId')
  async checkSigned(@Param('dealId') dealId: string) {
    const signed = await this.contractsService.isContractSignedForDeal(dealId);
    return { signed };
  }

  // === GET MY CONTRACTS ===
  
  @Get('contracts/me')
  async getMyContracts(@Req() req: any, @Query('customerId') customerId?: string) {
    const userId = customerId || req.user?.id;
    if (!userId) return [];
    return this.contractsService.getUserContracts(userId);
  }

  // === GET CONTRACT ===
  
  @Get('contracts/:id')
  async getContract(@Param('id') id: string) {
    return this.contractsService.getContract(id);
  }

  // === GET DEAL CONTRACTS ===
  
  @Get('contracts/deal/:dealId')
  async getDealContracts(@Param('dealId') dealId: string) {
    return this.contractsService.getDealContracts(dealId);
  }

  // === GET PDF TEMPLATE ===
  
  @Get('contracts/template/:type')
  @Header('Content-Type', 'application/pdf')
  async getTemplate(
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    const templateType = type as ContractTemplate || ContractTemplate.MEDIATION_AGREEMENT;
    const templatePath = this.pdfService.getTemplatePath(templateType);
    
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.setHeader('Content-Disposition', `inline; filename=${type}.pdf`);
    const stream = fs.createReadStream(templatePath);
    stream.pipe(res);
  }

  // === GET CONTRACT DATA FOR SIGNING ===
  
  @Get('contracts/:id/signing-data')
  async getSigningData(@Param('id') id: string) {
    const contract = await this.contractsService.getContract(id);
    
    // Get template base64
    const templateType = contract.type as ContractTemplate || ContractTemplate.MEDIATION_AGREEMENT;
    const templateBase64 = await this.pdfService.getTemplateBase64(templateType);
    
    return {
      contract,
      templateBase64,
      signingFields: {
        clientSignature: { page: 1, x: 120, y: 730, width: 200, height: 60 },
        executorSignature: { page: 1, x: 400, y: 730, width: 200, height: 60 },
      },
    };
  }

  // === SIGN WITH SIGNATURE DATA ===
  
  @Post('contracts/:id/sign-with-signature')
  async signWithSignature(
    @Param('id') id: string,
    @Body() body: { 
      signatureData: string; // Base64 signature image
      signedAt?: string;
    }
  ) {
    return this.contractsService.signContract(id, body.signatureData);
  }

  // === ADMIN: PENDING CONTRACTS ===
  
  @Get('admin/contracts/pending')
  async getPendingContracts() {
    return this.contractsService.getPendingContracts();
  }

  // === ADMIN: ANALYTICS ===
  
  @Get('admin/contracts/analytics')
  async getAnalytics(@Query('period') period?: string) {
    const periodDays = parseInt(period || '30', 10);
    return this.contractsService.getAnalytics(periodDays);
  }

  // === ADMIN: ACCOUNTING (Signatures Control) ===
  
  @Get('admin/contracts/accounting')
  async getAccountingData(
    @Query('period') period?: string,
    @Query('status') status?: string,
  ) {
    return this.contractsService.getAccountingOverview(
      parseInt(period || '30', 10),
      status
    );
  }

  // === ADMIN: EXPORT SIGNED CONTRACTS ===
  
  @Get('admin/contracts/export')
  async exportContracts(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.contractsService.exportContracts(from, to, status);
  }
}
