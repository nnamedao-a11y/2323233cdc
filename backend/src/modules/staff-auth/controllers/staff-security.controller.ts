import { 
  Controller, 
  Get, 
  Patch,
  Body, 
  UseGuards,
} from '@nestjs/common';
import { SecuritySettingsService } from '../services/security-settings.service';
import { UpdateSecuritySettingsDto } from '../dto/staff-auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../shared/enums';

@Controller('staff-security')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class StaffSecurityController {
  constructor(private readonly settingsService: SecuritySettingsService) {}

  /**
   * GET /api/staff-security/settings
   * Get current security settings
   */
  @Get('settings')
  async getSettings() {
    return this.settingsService.getSettings();
  }

  /**
   * PATCH /api/staff-security/settings
   * Update security settings
   */
  @Patch('settings')
  async updateSettings(@Body() dto: UpdateSecuritySettingsDto) {
    return this.settingsService.updateSettings(dto);
  }
}
