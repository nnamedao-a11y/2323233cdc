import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { File, FileEntityType } from '../schemas/file.schema';
import { UserRole } from '../../../shared/enums';

interface UserContext {
  id: string;
  role: string;
}

/**
 * File Access Control Service
 * Handles permission checks for file operations
 */
@Injectable()
export class FileAccessService {
  private readonly logger = new Logger(FileAccessService.name);

  /**
   * Check if user can view file
   */
  canViewFile(user: UserContext, file: File): boolean {
    // Admins can view all files
    if (this.isAdmin(user)) {
      return true;
    }

    // Public files are accessible to all
    if (file.access === 'public') {
      return true;
    }

    // Owner can always view
    if (file.uploadedBy === user.id) {
      return true;
    }

    // Finance can view financial documents
    if (user.role === UserRole.OWNER) {
      const financialTypes: FileEntityType[] = ['deposit', 'deal'];
      if (file.relatedTo && financialTypes.includes(file.relatedTo.entityType)) {
        return true;
      }
    }

    // For restricted access, check entity relationship
    if (file.access === 'restricted') {
      // TODO: Check if user is assigned to the related entity
      // This requires injecting leads/customers/deals services
      return false;
    }

    return false;
  }

  /**
   * Check if user can delete file
   */
  canDeleteFile(user: UserContext, file: File): boolean {
    // Only admins and owners can delete
    if (this.isAdmin(user)) {
      return true;
    }

    return file.uploadedBy === user.id;
  }

  /**
   * Check if user can upload for entity
   */
  canUploadForEntity(
    user: UserContext,
    entityType?: FileEntityType,
    entityId?: string,
  ): boolean {
    // Admins can upload anywhere
    if (this.isAdmin(user)) {
      return true;
    }

    // All authenticated users can upload generic files
    if (!entityType) {
      return true;
    }

    // Managers and above can upload for entities
    if ([UserRole.MANAGER, UserRole.TEAM_LEAD, UserRole.OWNER].includes(user.role as UserRole)) {
      return true;
    }

    // Finance can upload for deposits and deals
    if (user.role === UserRole.OWNER) {
      return ['deposit', 'deal'].includes(entityType);
    }

    return false;
  }

  /**
   * Enforce view permission
   */
  enforceViewPermission(user: UserContext, file: File): void {
    if (!this.canViewFile(user, file)) {
      throw new ForbiddenException('You do not have permission to view this file');
    }
  }

  /**
   * Enforce delete permission
   */
  enforceDeletePermission(user: UserContext, file: File): void {
    if (!this.canDeleteFile(user, file)) {
      throw new ForbiddenException('You do not have permission to delete this file');
    }
  }

  /**
   * Enforce upload permission
   */
  enforceUploadPermission(
    user: UserContext,
    entityType?: FileEntityType,
    entityId?: string,
  ): void {
    if (!this.canUploadForEntity(user, entityType, entityId)) {
      throw new ForbiddenException('You do not have permission to upload files here');
    }
  }

  private isAdmin(user: UserContext): boolean {
    return [UserRole.TEAM_LEAD, UserRole.OWNER].includes(user.role as UserRole);
  }
}
