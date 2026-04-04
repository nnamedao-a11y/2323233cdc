import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';
import { ROLE_PERMISSIONS, LEAD_STATUS_TRANSITIONS, DEAL_STATUS_TRANSITIONS, DEPOSIT_STATUS_TRANSITIONS } from '../../shared/constants/permissions';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  @Get()
  @Roles(UserRole.OWNER, UserRole.TEAM_LEAD)
  async getRoles() {
    return {
      roles: Object.values(UserRole),
      permissions: ROLE_PERMISSIONS,
    };
  }

  @Get('transitions')
  async getTransitions() {
    return {
      lead: LEAD_STATUS_TRANSITIONS,
      deal: DEAL_STATUS_TRANSITIONS,
      deposit: DEPOSIT_STATUS_TRANSITIONS,
    };
  }
}
