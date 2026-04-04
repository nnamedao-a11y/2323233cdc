import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { CustomerAccess, CustomerAccessDocument } from '../customer-cabinet/schemas/customer-access.schema';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';

export class CustomerRegisterDto {
  @IsString()
  @IsOptional()
  customerId?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class CustomerLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);
  private googleClient: OAuth2Client;

  constructor(
    @InjectModel(CustomerAccess.name)
    private readonly accessModel: Model<CustomerAccessDocument>,
    @InjectModel('Customer')
    private readonly customerModel: Model<any>,
    @InjectModel('CustomerSession')
    private readonly sessionModel: Model<any>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Initialize Google OAuth client
    const googleClientId = this.configService.get('GOOGLE_CLIENT_ID');
    if (googleClientId) {
      this.googleClient = new OAuth2Client(googleClientId);
    }
  }

  // ============ NATIVE GOOGLE SIGN-IN ============

  /**
   * Verify Google ID token from native Google Sign-In popup
   */
  async verifyGoogleToken(credential: string) {
    if (!this.googleClient) {
      throw new UnauthorizedException('Google Sign-In not configured');
    }

    try {
      // Verify the token
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token');
      }

      const { email, name, picture, sub: googleId } = payload;

      // Find or create customer
      let customer = await this.customerModel.findOne({ email: email.toLowerCase() }).lean();

      if (!customer) {
        // Create new customer
        const nameParts = (name || email.split('@')[0]).split(' ');
        const firstName = nameParts[0] || 'User';
        const lastName = nameParts.slice(1).join(' ') || '';

        const newCustomer = await this.customerModel.create({
          id: `cust_${uuidv4().slice(0, 12)}`,
          email: email.toLowerCase(),
          firstName,
          lastName: lastName || firstName,
          phone: '',
          picture,
          googleId,
          status: 'active',
          source: 'google_oauth',
          authProvider: 'google',
          isDeleted: false,
          createdAt: new Date(),
        });
        customer = newCustomer.toObject();
        this.logger.log(`New Google customer created: ${email}`);
      } else {
        // Update picture/googleId if changed
        const customerData = customer as any;
        if ((picture && customerData.picture !== picture) || !customerData.googleId) {
          await this.customerModel.updateOne(
            { email: email.toLowerCase() },
            { $set: { picture, googleId, authProvider: 'google' } }
          );
        }
      }

      const customerData = customer as any;
      const customerId = customerData.id || String(customerData._id);

      // Create session
      const sessionToken = `sess_${uuidv4()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Remove old sessions
      await this.sessionModel.deleteMany({ customerId });

      // Create new session
      await this.sessionModel.create({
        customerId,
        sessionToken,
        expiresAt,
        createdAt: new Date(),
      });

      this.logger.log(`Google Sign-In session created for: ${email}`);

      return {
        customerId,
        email: email.toLowerCase(),
        name: name || customerData.firstName,
        picture: picture || customerData.picture,
        sessionToken,
      };
    } catch (error) {
      this.logger.error(`Google token verification error: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired Google token');
    }
  }

  // ============ EMERGENT AUTH (LEGACY) ============

  /**
   * Process session_id from Emergent Auth
   * Creates/updates customer and returns session token
   */
  async processGoogleSession(sessionId: string) {
    if (!sessionId) {
      throw new UnauthorizedException('Session ID is required');
    }

    // Call Emergent Auth to get user data
    try {
      const response = await axios.get(
        'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data',
        {
          headers: { 'X-Session-ID': sessionId },
        }
      );

      const { id, email, name, picture, session_token } = response.data;

      if (!email) {
        throw new UnauthorizedException('Invalid session data');
      }

      // Find or create customer
      let customer = await this.customerModel.findOne({ email: email.toLowerCase() }).lean();

      if (!customer) {
        // Create new customer
        const nameParts = (name || email.split('@')[0]).split(' ');
        const firstName = nameParts[0] || 'User';
        const lastName = nameParts.slice(1).join(' ') || '';

        const newCustomer = await this.customerModel.create({
          id: `cust_${uuidv4().slice(0, 12)}`,
          email: email.toLowerCase(),
          firstName,
          lastName: lastName || firstName,
          phone: '',
          picture,
          status: 'active',
          source: 'google_oauth',
          authProvider: 'google',
          isDeleted: false,
          createdAt: new Date(),
        });
        customer = newCustomer.toObject();
        this.logger.log(`New Google customer created: ${email}`);
      } else {
        // Update picture if changed
        const customerData = customer as any;
        if (picture && customerData.picture !== picture) {
          await this.customerModel.updateOne(
            { email: email.toLowerCase() },
            { $set: { picture, authProvider: 'google' } }
          );
        }
      }

      const customerData = customer as any;
      const customerId = customerData.id || String(customerData._id);

      // Create session in DB
      const sessionToken = session_token || `sess_${uuidv4()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Remove old sessions
      await this.sessionModel.deleteMany({ customerId });

      // Create new session
      await this.sessionModel.create({
        customerId,
        sessionToken,
        expiresAt,
        createdAt: new Date(),
      });

      this.logger.log(`Google session created for: ${email}`);

      return {
        customerId,
        email: email.toLowerCase(),
        name: name || customerData.firstName,
        picture: picture || customerData.picture,
        sessionToken,
      };
    } catch (error) {
      this.logger.error(`Google session error: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  /**
   * Get user from session token
   */
  async getGoogleSession(sessionToken: string) {
    const session = await this.sessionModel.findOne({ sessionToken }).lean() as any;

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    // Check expiry with timezone awareness
    let expiresAt = session.expiresAt;
    if (typeof expiresAt === 'string') {
      expiresAt = new Date(expiresAt);
    }
    if (!expiresAt.getTimezoneOffset) {
      expiresAt = new Date(expiresAt);
    }

    if (expiresAt < new Date()) {
      await this.sessionModel.deleteOne({ sessionToken });
      throw new UnauthorizedException('Session expired');
    }

    // Get customer
    const customer = await this.customerModel.findOne(
      { id: session.customerId },
      { _id: 0 }
    ).lean() as any;

    if (!customer) {
      throw new UnauthorizedException('Customer not found');
    }

    return {
      customerId: customer.id,
      email: customer.email,
      name: customer.firstName + (customer.lastName ? ' ' + customer.lastName : ''),
      picture: customer.picture,
      firstName: customer.firstName,
      lastName: customer.lastName,
      sessionToken, // Return session token for frontend to persist
    };
  }

  /**
   * Delete session (logout)
   */
  async deleteGoogleSession(sessionToken: string) {
    await this.sessionModel.deleteOne({ sessionToken });
  }

  async register(dto: CustomerRegisterDto) {
    this.logger.log(`Register attempt with: ${JSON.stringify(dto)}`);
    
    if (!dto || !dto.email) {
      throw new BadRequestException('Email є обов\'язковим');
    }
    if (!dto.password || dto.password.length < 6) {
      throw new BadRequestException('Пароль повинен містити мінімум 6 символів');
    }
    
    const email = dto.email.toLowerCase().trim();
    
    // Check if email already exists
    const exists = await this.accessModel.findOne({ email });
    if (exists) {
      throw new BadRequestException('Email вже зареєстровано');
    }

    // Check if customer exists
    let customer: any = await this.customerModel.findOne({
      $or: [{ id: dto.customerId }, { email }],
    }).lean();

    // If no customer, create one
    if (!customer) {
      const nameParts = (dto.name || email.split('@')[0]).split(' ');
      const firstName = nameParts[0] || 'Клієнт';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const newCustomer = await this.customerModel.create({
        id: dto.customerId || uuidv4(),
        email,
        firstName,
        lastName: lastName || firstName,
        phone: '',
        status: 'active',
        source: 'cabinet_registration',
        isDeleted: false,
        createdAt: new Date(),
      });
      customer = newCustomer.toObject();
    }

    const customerId = (customer as any).id || String((customer as any)._id);

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create access record
    const access = await this.accessModel.create({
      id: uuidv4(),
      customerId,
      email,
      passwordHash,
      isActive: true,
      isVerified: false,
      loginCount: 0,
    });

    this.logger.log(`Customer registered: ${email}`);
    return this.buildAuthResponse(access, customer);
  }

  async login(dto: CustomerLoginDto) {
    if (!dto.email || !dto.password) {
      throw new UnauthorizedException('Невірний email або пароль');
    }
    
    const email = dto.email.toLowerCase().trim();
    
    const access = await this.accessModel.findOne({ email });
    if (!access) {
      throw new UnauthorizedException('Невірний email або пароль');
    }

    if (!access.isActive) {
      throw new UnauthorizedException('Акаунт деактивовано');
    }

    const isValid = await bcrypt.compare(dto.password, access.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Невірний email або пароль');
    }

    // Update last login
    access.lastLoginAt = new Date();
    access.loginCount = (access.loginCount || 0) + 1;
    await access.save();

    // Get customer data - try by id field first
    let customer: any = await this.customerModel.findOne({ id: access.customerId }).lean();
    
    // Fallback to _id only if it looks like ObjectId
    if (!customer && /^[a-f\d]{24}$/i.test(access.customerId)) {
      customer = await this.customerModel.findById(access.customerId).lean();
    }

    this.logger.log(`Customer logged in: ${email}`);
    return this.buildAuthResponse(access, customer);
  }

  async validateToken(customerId: string): Promise<any> {
    const access = await this.accessModel.findOne({
      customerId,
      isActive: true,
    }).lean();

    if (!access) return null;

    // Get customer - try by id field first
    let customer: any = await this.customerModel.findOne({ id: access.customerId }).lean();
    
    // Fallback to _id only if it looks like ObjectId
    if (!customer && /^[a-f\d]{24}$/i.test(access.customerId)) {
      customer = await this.customerModel.findById(access.customerId).lean();
    }

    return customer;
  }

  async getProfile(customerId: string): Promise<any> {
    const access = await this.accessModel.findOne({
      customerId,
    }).lean();

    if (!access) return null;

    // Get customer - try by id field first
    let customer: any = await this.customerModel.findOne({ id: customerId }).lean();
    
    // Fallback to _id only if it looks like ObjectId
    if (!customer && /^[a-f\d]{24}$/i.test(customerId)) {
      customer = await this.customerModel.findById(customerId).lean();
    }

    return {
      email: access.email,
      isVerified: access.isVerified,
      lastLoginAt: access.lastLoginAt,
      loginCount: access.loginCount,
      customer: customer ? {
        id: customer.id || String(customer._id),
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      } : null,
    };
  }

  private buildAuthResponse(access: CustomerAccessDocument, customer: any) {
    const payload = {
      sub: access.customerId,
      email: access.email,
      role: 'customer',
    };

    const customerData = customer as any;

    return {
      accessToken: this.jwtService.sign(payload),
      customerId: access.customerId,
      email: access.email,
      customer: customerData ? {
        id: customerData.id || String(customerData._id),
        name: customerData.name,
        email: customerData.email,
        phone: customerData.phone,
      } : null,
    };
  }

  // ============ PROFILE UPDATE METHODS ============

  /**
   * Update customer profile (name, city, phone)
   */
  async updateProfile(customerId: string, data: {
    firstName?: string;
    lastName?: string;
    city?: string;
    phone?: string;
  }) {
    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.phone !== undefined) updateData.phone = data.phone;
    updateData.updatedAt = new Date();

    const result = await this.customerModel.findOneAndUpdate(
      { id: customerId },
      { $set: updateData },
      { new: true }
    ).lean();

    if (!result) {
      throw new BadRequestException('Customer not found');
    }

    this.logger.log(`Profile updated for customer: ${customerId}`);
    return result;
  }

  /**
   * Update customer email
   */
  async updateEmail(customerId: string, newEmail: string, password: string) {
    const email = newEmail.toLowerCase().trim();

    // Check if email already exists
    const existing = await this.accessModel.findOne({ email, customerId: { $ne: customerId } });
    if (existing) {
      throw new BadRequestException('Email вже використовується');
    }

    // Verify password
    const access = await this.accessModel.findOne({ customerId });
    if (!access) {
      throw new BadRequestException('Access record not found');
    }

    const isValid = await bcrypt.compare(password, access.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Невірний пароль');
    }

    // Update email in both collections
    await this.accessModel.updateOne({ customerId }, { $set: { email } });
    await this.customerModel.updateOne({ id: customerId }, { $set: { email, updatedAt: new Date() } });

    this.logger.log(`Email updated for customer: ${customerId}`);
    return { success: true, email };
  }

  /**
   * Change customer password
   */
  async changePassword(customerId: string, currentPassword: string, newPassword: string) {
    if (newPassword.length < 6) {
      throw new BadRequestException('Пароль повинен містити мінімум 6 символів');
    }

    const access = await this.accessModel.findOne({ customerId });
    if (!access) {
      throw new BadRequestException('Access record not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, access.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Поточний пароль невірний');
    }

    // Hash and save new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    access.passwordHash = passwordHash;
    await access.save();

    this.logger.log(`Password changed for customer: ${customerId}`);
    return { success: true };
  }

  /**
   * Update customer avatar
   */
  async updateAvatar(customerId: string, avatarUrl: string) {
    const result = await this.customerModel.findOneAndUpdate(
      { id: customerId },
      { $set: { picture: avatarUrl, updatedAt: new Date() } },
      { new: true }
    ).lean();

    if (!result) {
      throw new BadRequestException('Customer not found');
    }

    this.logger.log(`Avatar updated for customer: ${customerId}`);
    return { success: true, picture: avatarUrl };
  }
}
