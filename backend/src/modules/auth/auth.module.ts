import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SecurityController } from './security.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenRefreshService } from './token-refresh.service';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { StaffSessionModule } from '../staff-sessions/staff-session.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => AuditLogModule),
    forwardRef(() => StaffSessionModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' }, // Short-lived access tokens
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, SecurityController],
  providers: [AuthService, JwtStrategy, TokenRefreshService],
  exports: [AuthService, JwtModule, TokenRefreshService],
})
export class AuthModule {}
