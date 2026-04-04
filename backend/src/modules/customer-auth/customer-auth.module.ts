import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerAccess, CustomerAccessSchema } from '../customer-cabinet/schemas/customer-access.schema';
import { CustomerSavedListing, CustomerSavedListingSchema } from './schemas/customer-saved-listing.schema';
import { CustomerRecentlyViewed, CustomerRecentlyViewedSchema } from './schemas/customer-recently-viewed.schema';
import { CustomerSession, CustomerSessionSchema } from './schemas/customer-session.schema';
import { VehicleListing, VehicleListingSchema } from '../publishing/schemas/vehicle-listing.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerRetentionService } from './customer-retention.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerJwtStrategy } from './customer-jwt.strategy';
import { CustomerUniversalGuard } from './customer-universal.guard';

/**
 * Customer Auth Module
 * 
 * Authentication and retention for customer cabinet
 * - Google OAuth (Emergent Auth)
 * - JWT-based login/register (legacy)
 * - Saved listings
 * - Recently viewed
 */

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'customer-jwt' }),
    JwtModule.register({
      secret: process.env.CUSTOMER_JWT_SECRET || 'customer-secret-key-for-cabinet-auth-2026',
      signOptions: { expiresIn: '30d' },
    }),
    MongooseModule.forFeature([
      { name: CustomerAccess.name, schema: CustomerAccessSchema },
      { name: CustomerSavedListing.name, schema: CustomerSavedListingSchema },
      { name: CustomerRecentlyViewed.name, schema: CustomerRecentlyViewedSchema },
      { name: CustomerSession.name, schema: CustomerSessionSchema },
      { name: 'VehicleListing', schema: VehicleListingSchema },
      { name: 'Customer', schema: CustomerSchema },
    ]),
  ],
  providers: [
    CustomerAuthService,
    CustomerRetentionService,
    CustomerJwtStrategy,
    CustomerUniversalGuard,
  ],
  controllers: [CustomerAuthController],
  exports: [CustomerAuthService, CustomerRetentionService, CustomerUniversalGuard],
})
export class CustomerAuthModule {}

// Re-export guards for use in other modules
export { CustomerJwtGuard } from './customer-jwt.guard';
export { CustomerUniversalGuard } from './customer-universal.guard';
