import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, AuditAction, EntityType } from '../../shared/enums';
import { PaginationDto } from '../../shared/dto/pagination.dto';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async findAll(
    @Query() query: PaginationDto & {
      userId?: string;
      entityType?: EntityType;
      action?: AuditAction;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.auditLogService.findAll(query);
  }
}
