import { Controller, Post, Body, Request, UseGuards, Get, Ip, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenRefreshService } from './token-refresh.service';
import { LoginDto, RegisterDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenRefreshService: TokenRefreshService,
  ) {}

  @Post('login')
  async login(
    @Body() loginDto: LoginDto, 
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result = await this.authService.login(loginDto, ip, userAgent);
    
    // Generate token pair with refresh token
    const tokenPair = await this.tokenRefreshService.generateTokenPair(
      result.user,
      undefined,
      ip,
    );
    
    return {
      ...result,
      access_token: tokenPair.accessToken,
      refresh_token: tokenPair.refreshToken,
      expires_in: tokenPair.expiresIn,
      refresh_expires_in: tokenPair.refreshExpiresIn,
    };
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * Refresh access token using refresh token
   * POST /api/auth/refresh
   */
  @Post('refresh')
  async refreshToken(@Body() body: { refresh_token: string }) {
    const result = await this.tokenRefreshService.refreshAccessToken(body.refresh_token);
    return {
      access_token: result.accessToken,
      expires_in: result.expiresIn,
    };
  }

  /**
   * Logout - revoke refresh token
   * POST /api/auth/logout
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Body() body: { refresh_token?: string }, @Request() req) {
    if (body.refresh_token) {
      await this.tokenRefreshService.revokeRefreshToken(body.refresh_token);
    }
    // Also revoke all user tokens for complete logout
    await this.tokenRefreshService.revokeAllUserTokens(req.user.id);
    return { message: 'Logged out successfully' };
  }

  /**
   * Get active sessions
   * GET /api/auth/sessions
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@Request() req) {
    return this.tokenRefreshService.getUserSessions(req.user.id);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Request() req, @Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req) {
    return this.authService.validateUser(req.user.id);
  }
}
