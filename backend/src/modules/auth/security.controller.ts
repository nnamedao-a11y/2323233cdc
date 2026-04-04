import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { StaffSessionService } from '../staff-sessions/staff-session.service';
import { UsersService } from '../users/users.service';

@Controller('admin/security')
@UseGuards(JwtAuthGuard)
export class SecurityController {
  constructor(
    private readonly sessionService: StaffSessionService,
    private readonly usersService: UsersService,
  ) {}

  // === 2FA STATUS ===
  @Get('2fa/status')
  async get2FAStatus(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);
    return { 
      enabled: !!user?.twoFactorEnabled,
      method: 'totp'
    };
  }

  // === 2FA SETUP ===
  @Post('2fa/setup')
  async setup2FA(@Req() req: any) {
    return this.sessionService.setup2FA(req.user.id);
  }

  // === 2FA VERIFY ===
  @Post('2fa/verify')
  async verify2FA(
    @Req() req: any,
    @Body() body: { token: string },
  ) {
    // For initial setup, we use a temp session ID
    const verified = await this.sessionService.verify2FA(req.user.id, body.token, 'setup');
    if (!verified) {
      throw new Error('Invalid verification code');
    }
    return { success: true };
  }

  // === 2FA DISABLE ===
  @Post('2fa/disable')
  async disable2FA(@Req() req: any) {
    // Clear 2FA from user
    const user = req.user;
    await this.usersService.update(user.id, {
      twoFactorEnabled: false,
      twoFactorSecret: null
    } as any);
    return { success: true };
  }
}
