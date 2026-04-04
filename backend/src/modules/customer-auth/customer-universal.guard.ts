import { Injectable, ExecutionContext, UnauthorizedException, CanActivate, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * Universal Customer Auth Guard
 * 
 * Supports:
 * 1. JWT token (Authorization: Bearer <jwt>) - email/password login
 * 2. Session token (Authorization: Bearer <session>) - Google OAuth
 * 3. Google OAuth session (cookie: customer_session)
 */
@Injectable()
export class CustomerUniversalGuard implements CanActivate {
  private readonly logger = new Logger(CustomerUniversalGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectModel('CustomerSession')
    private readonly sessionModel: Model<any>,
    @InjectModel('Customer')
    private readonly customerModel: Model<any>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const authHeader = request.headers.authorization;
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Try as JWT token first
      try {
        const payload = this.jwtService.verify(token);
        if (payload?.sub) {
          request.user = {
            customerId: payload.sub,
            email: payload.email,
          };
          return true;
        }
      } catch (e) {
        // JWT invalid, try as session token
        this.logger.debug(`JWT validation failed, trying session token`);
      }
      
      // Try as session token (any format - sess_xxx or Emergent token)
      const sessionResult = await this.validateSessionToken(token);
      if (sessionResult) {
        request.user = sessionResult;
        return true;
      }
    }

    // Try Google OAuth session cookie
    const sessionToken = request.cookies?.customer_session;
    if (sessionToken) {
      const result = await this.validateSessionToken(sessionToken);
      if (result) {
        request.user = result;
        return true;
      }
    }

    throw new UnauthorizedException('Необхідна авторизація');
  }

  private async validateSessionToken(sessionToken: string): Promise<{ customerId: string; email: string } | null> {
    try {
      const session = await this.sessionModel.findOne({ sessionToken }).lean() as any;
      if (session) {
        // Check expiry
        let expiresAt = session.expiresAt;
        if (typeof expiresAt === 'string') expiresAt = new Date(expiresAt);
        
        if (expiresAt > new Date()) {
          // Get customer email
          const customer = await this.customerModel.findOne({ id: session.customerId }).lean() as any;
          this.logger.debug(`Session token validated for customer: ${session.customerId}`);
          return {
            customerId: session.customerId,
            email: customer?.email,
          };
        } else {
          this.logger.debug(`Session token expired`);
        }
      } else {
        this.logger.debug(`Session token not found in DB`);
      }
    } catch (e) {
      this.logger.debug(`Session validation error: ${e.message}`);
    }
    return null;
  }
}
