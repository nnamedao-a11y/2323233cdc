import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

// Schemas
import { LoginRequest, LoginRequestSchema } from './schemas/login-request.schema';
import { StaffSession, StaffSessionSchema } from './schemas/staff-session.schema';
import { SecuritySettings, SecuritySettingsSchema } from './schemas/security-settings.schema';
import { User, UserSchema } from '../users/user.schema';

// Services
import { StaffAuthService } from './services/staff-auth.service';
import { SmsVerificationService } from './services/sms-verification.service';
import { LoginApprovalService } from './services/login-approval.service';
import { StaffSessionService } from './services/staff-session.service';
import { SecuritySettingsService } from './services/security-settings.service';

// Controllers
import { StaffAuthController } from './controllers/staff-auth.controller';
import { StaffSessionController } from './controllers/staff-session.controller';
import { StaffSecurityController } from './controllers/staff-security.controller';

// Dependencies
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: LoginRequest.name, schema: LoginRequestSchema },
      { name: StaffSession.name, schema: StaffSessionSchema },
      { name: SecuritySettings.name, schema: SecuritySettingsSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [
    StaffAuthController,
    StaffSessionController,
    StaffSecurityController,
  ],
  providers: [
    StaffAuthService,
    SmsVerificationService,
    LoginApprovalService,
    StaffSessionService,
    SecuritySettingsService,
  ],
  exports: [
    StaffAuthService,
    StaffSessionService,
    SecuritySettingsService,
  ],
})
export class StaffAuthModule {}
