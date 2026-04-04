import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CustomerAuthService } from './customer-auth.service';

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(
  Strategy,
  'customer-jwt',
) {
  constructor(private readonly authService: CustomerAuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.CUSTOMER_JWT_SECRET || 'customer-secret-key-for-cabinet-auth-2026',
    });
  }

  async validate(payload: any) {
    const customer = await this.authService.validateToken(payload.sub);
    if (!customer) {
      throw new UnauthorizedException('Invalid token');
    }
    return {
      customerId: payload.sub,
      email: payload.email,
      role: payload.role,
      customer,
    };
  }
}
