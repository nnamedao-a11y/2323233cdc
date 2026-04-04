/**
 * JWT Refresh Token Service
 * 
 * Implements token refresh mechanism to prevent 403 errors during long sessions:
 * - Short-lived access tokens (15 minutes)
 * - Long-lived refresh tokens (7 days)
 * - Auto-refresh on token expiry
 */

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Refresh Token Schema (can be added to existing schemas)
export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  isRevoked: boolean;
  deviceId?: string;
  ip?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);
  
  // In-memory refresh token store (production should use Redis/DB)
  private refreshTokens = new Map<string, RefreshToken>();
  
  // Token expiry times
  private readonly ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;
  private readonly ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.logger.log('TokenRefreshService initialized');
    
    // Cleanup expired tokens every hour
    setInterval(() => this.cleanupExpiredTokens(), 60 * 60 * 1000);
  }

  /**
   * Generate access token and refresh token pair
   */
  async generateTokenPair(user: { id: string; email: string; role: string }, deviceId?: string, ip?: string): Promise<TokenPair> {
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      type: 'access',
    };
    
    // Generate short-lived access token
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });
    
    // Generate refresh token
    const refreshTokenId = uuidv4();
    const refreshToken = this.jwtService.sign(
      { 
        sub: user.id, 
        tokenId: refreshTokenId,
        type: 'refresh',
      },
      { expiresIn: `${this.REFRESH_TOKEN_EXPIRY_DAYS}d` }
    );
    
    // Store refresh token
    const refreshTokenData: RefreshToken = {
      id: refreshTokenId,
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_SECONDS * 1000),
      createdAt: new Date(),
      isRevoked: false,
      deviceId,
      ip,
    };
    
    this.refreshTokens.set(refreshTokenId, refreshTokenData);
    this.logger.debug(`Generated token pair for user ${user.id}`);
    
    return {
      accessToken,
      refreshToken,
      expiresIn: this.ACCESS_TOKEN_EXPIRY_SECONDS,
      refreshExpiresIn: this.REFRESH_TOKEN_EXPIRY_SECONDS,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      // Verify refresh token
      const decoded = this.jwtService.verify(refreshToken);
      
      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }
      
      // Check if refresh token exists and is not revoked
      const storedToken = this.refreshTokens.get(decoded.tokenId);
      
      if (!storedToken) {
        throw new UnauthorizedException('Refresh token not found');
      }
      
      if (storedToken.isRevoked) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }
      
      if (new Date() > storedToken.expiresAt) {
        this.refreshTokens.delete(decoded.tokenId);
        throw new UnauthorizedException('Refresh token has expired');
      }
      
      // Generate new access token
      const accessToken = this.jwtService.sign({
        sub: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        type: 'access',
      }, {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
      });
      
      this.logger.debug(`Refreshed access token for user ${decoded.sub}`);
      
      return {
        accessToken,
        expiresIn: this.ACCESS_TOKEN_EXPIRY_SECONDS,
      };
    } catch (error) {
      this.logger.warn(`Token refresh failed: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Revoke refresh token (logout)
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const decoded = this.jwtService.verify(refreshToken);
      const storedToken = this.refreshTokens.get(decoded.tokenId);
      
      if (storedToken) {
        storedToken.isRevoked = true;
        this.logger.debug(`Revoked refresh token ${decoded.tokenId}`);
      }
    } catch (error) {
      this.logger.warn(`Token revocation failed: ${error.message}`);
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    let revokedCount = 0;
    
    for (const [tokenId, token] of this.refreshTokens.entries()) {
      if (token.userId === userId && !token.isRevoked) {
        token.isRevoked = true;
        revokedCount++;
      }
    }
    
    this.logger.log(`Revoked ${revokedCount} tokens for user ${userId}`);
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string): Promise<Array<{ id: string; deviceId?: string; ip?: string; createdAt: Date }>> {
    const sessions: Array<{ id: string; deviceId?: string; ip?: string; createdAt: Date }> = [];
    
    for (const [tokenId, token] of this.refreshTokens.entries()) {
      if (token.userId === userId && !token.isRevoked && new Date() < token.expiresAt) {
        sessions.push({
          id: tokenId,
          deviceId: token.deviceId,
          ip: token.ip,
          createdAt: token.createdAt,
        });
      }
    }
    
    return sessions;
  }

  /**
   * Cleanup expired tokens
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    let deletedCount = 0;
    
    for (const [tokenId, token] of this.refreshTokens.entries()) {
      if (now > token.expiresAt || token.isRevoked) {
        this.refreshTokens.delete(tokenId);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      this.logger.log(`Cleaned up ${deletedCount} expired/revoked tokens`);
    }
  }

  /**
   * Check if access token is about to expire (for proactive refresh)
   */
  isTokenExpiringSoon(token: string, thresholdSeconds: number = 60): boolean {
    try {
      const decoded = this.jwtService.decode(token) as any;
      if (!decoded || !decoded.exp) return true;
      
      const expiresAt = decoded.exp * 1000;
      const threshold = thresholdSeconds * 1000;
      
      return Date.now() + threshold > expiresAt;
    } catch {
      return true;
    }
  }
}
