import { 
  Controller, 
  Post, 
  Get,
  Body, 
  Param, 
  Req, 
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StaffAuthService } from '../services/staff-auth.service';
import { StaffLoginDto, VerifySmsDto, DenyLoginDto } from '../dto/staff-auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../shared/enums';

@Controller('staff-auth')
export class StaffAuthController {
  constructor(private readonly authService: StaffAuthService) {}

  /**
   * POST /api/staff-auth/login
   * Start login flow - verify credentials, send SMS
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: StaffLoginDto, @Req() req: any) {
    return this.authService.loginStart(dto, req);
  }

  /**
   * POST /api/staff-auth/verify-sms
   * Verify SMS code
   */
  @Post('verify-sms')
  @HttpCode(HttpStatus.OK)
  async verifySms(@Body() dto: VerifySmsDto, @Req() req: any) {
    return this.authService.verifySms(dto, req);
  }

  /**
   * GET /api/staff-auth/status/:token
   * Check login request status (for polling)
   */
  @Get('status/:token')
  async checkStatus(@Param('token') token: string) {
    return this.authService.getLoginRequestStatus(token);
  }

  /**
   * POST /api/staff-auth/approve/:token
   * Owner approves login request
   */
  @Post('approve/:token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async approveLogin(@Param('token') token: string, @Req() req: any) {
    return this.authService.approveLogin(token, req.user.id);
  }

  /**
   * POST /api/staff-auth/deny/:token
   * Owner denies login request
   */
  @Post('deny/:token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async denyLogin(
    @Param('token') token: string, 
    @Body() dto: DenyLoginDto,
    @Req() req: any,
  ) {
    return this.authService.denyLogin(token, req.user.id, dto.reason);
  }

  /**
   * GET /api/staff-auth/pending
   * Get pending login requests (for owner dashboard)
   */
  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async getPendingRequests() {
    return this.authService.getPendingRequests();
  }
}
