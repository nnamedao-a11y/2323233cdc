import { 
  Controller, 
  Post, 
  Get, 
  Patch, 
  Delete, 
  Param, 
  Body, 
  Query,
  Request,
} from '@nestjs/common';
import { DocumentsService } from '../services/documents.service';
import { 
  CreateDocumentDto, 
  UpdateDocumentDto, 
  QueryDocumentsDto,
  AttachFilesDto,
  VerifyDocumentDto,
  RejectDocumentDto,
} from '../dto/document.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * Create document
   */
  @Post()
  async create(@Body() dto: CreateDocumentDto, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.documentsService.create(dto, userId);
  }

  /**
   * Get document by ID
   */
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.documentsService.getById(id);
  }

  /**
   * Update document
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.documentsService.update(id, dto, userId);
  }

  /**
   * Attach files to document
   */
  @Post(':id/attach-files')
  async attachFiles(
    @Param('id') id: string,
    @Body() dto: AttachFilesDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.documentsService.attachFiles(id, dto, userId);
  }

  /**
   * Submit document for verification
   */
  @Post(':id/submit-for-verification')
  async submitForVerification(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.documentsService.submitForVerification(id, userId);
  }

  /**
   * Verify document (admin/finance only)
   */
  @Post(':id/verify')
  async verify(
    @Param('id') id: string,
    @Body() dto: VerifyDocumentDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.documentsService.verify(id, dto.note, userId);
  }

  /**
   * Reject document (admin/finance only)
   */
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDocumentDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.documentsService.reject(id, dto.reason, userId);
  }

  /**
   * Archive document
   */
  @Post(':id/archive')
  async archive(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id || 'system';
    return this.documentsService.archive(id, userId);
  }

  /**
   * Delete document
   */
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id || 'system';
    await this.documentsService.delete(id, userId);
    return { success: true };
  }

  /**
   * Query documents
   */
  @Get()
  async query(@Query() dto: QueryDocumentsDto) {
    return this.documentsService.query(dto);
  }

  /**
   * Get pending verification documents
   */
  @Get('queue/pending-verification')
  async getPendingVerification() {
    return this.documentsService.getPendingVerification();
  }

  /**
   * Get documents by customer
   */
  @Get('customer/:customerId')
  async getByCustomer(@Param('customerId') customerId: string) {
    return this.documentsService.getByCustomer(customerId);
  }

  /**
   * Get documents by deal
   */
  @Get('deal/:dealId')
  async getByDeal(@Param('dealId') dealId: string) {
    return this.documentsService.getByDeal(dealId);
  }

  /**
   * Get documents by deposit
   */
  @Get('deposit/:depositId')
  async getByDeposit(@Param('depositId') depositId: string) {
    return this.documentsService.getByDeposit(depositId);
  }
}
