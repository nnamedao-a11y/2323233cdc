import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Param, 
  Body, 
  Query,
  UseInterceptors,
  UploadedFile,
  Request,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { FilesService } from '../services/files.service';
import { FileAccessService } from '../services/file-access.service';
import { UploadFileDto, BindFileDto, QueryFilesDto } from '../dto/file.dto';

@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly fileAccessService: FileAccessService,
  ) {}

  /**
   * Upload a file
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const userId = req.user?.id || 'system';
    const user = { id: userId, role: req.user?.role || 'manager' };

    // Check upload permission
    this.fileAccessService.enforceUploadPermission(user, dto.entityType, dto.entityId);

    return this.filesService.uploadFile(file, dto, userId);
  }

  /**
   * Get file by ID
   */
  @Get(':id')
  async getFile(@Param('id') id: string, @Request() req: any) {
    const file = await this.filesService.getById(id);
    
    // Check view permission
    const user = { id: req.user?.id || 'system', role: req.user?.role || 'manager' };
    this.fileAccessService.enforceViewPermission(user, file);

    return file;
  }

  /**
   * Get signed URL for file download
   */
  @Get(':id/url')
  async getFileUrl(
    @Param('id') id: string,
    @Query('expiresIn') expiresIn: string,
    @Request() req: any,
  ) {
    const file = await this.filesService.getById(id);
    
    // Check view permission
    const user = { id: req.user?.id || 'system', role: req.user?.role || 'manager' };
    this.fileAccessService.enforceViewPermission(user, file);

    const expires = expiresIn ? parseInt(expiresIn, 10) : 3600;
    const url = await this.filesService.getSignedUrl(id, expires);
    
    return { url, expiresIn: expires };
  }

  /**
   * Serve file directly (for local storage)
   */
  @Get('serve/:storageKey(*)')
  async serveFile(
    @Param('storageKey') storageKey: string,
    @Res() res: Response,
  ) {
    const filePath = this.filesService.getLocalFilePath(storageKey);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.sendFile(filePath);
  }

  /**
   * Delete file
   */
  @Delete(':id')
  async deleteFile(@Param('id') id: string, @Request() req: any) {
    const file = await this.filesService.getById(id);
    
    // Check delete permission
    const user = { id: req.user?.id || 'system', role: req.user?.role || 'manager' };
    this.fileAccessService.enforceDeletePermission(user, file);

    await this.filesService.deleteFile(id, user.id);
    return { success: true };
  }

  /**
   * Bind file to entity
   */
  @Post(':id/bind')
  async bindToEntity(
    @Param('id') id: string,
    @Body() dto: BindFileDto,
  ) {
    return this.filesService.bindToEntity(id, dto.entityType as any, dto.entityId);
  }

  /**
   * Query files
   */
  @Get()
  async queryFiles(@Query() dto: QueryFilesDto) {
    return this.filesService.query(dto);
  }

  /**
   * Get files by entity
   */
  @Get('entity/:entityType/:entityId')
  async getByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.filesService.getByEntity(entityType as any, entityId);
  }
}
