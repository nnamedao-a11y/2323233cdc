import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User } from './user.schema';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { toObjectResponse, toArrayResponse, generateId } from '../../shared/utils';
import { UserRole } from '../../shared/enums';
import { PaginationDto, PaginatedResult } from '../../shared/dto/pagination.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    
    const user = new this.userModel({
      ...createUserDto,
      id: generateId(),
      password: hashedPassword,
    });
    
    const saved = await user.save();
    return this.toResponse(saved);
  }

  async findAll(query: PaginationDto): Promise<PaginatedResult<UserResponseDto>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', search } = query;
    
    const filter: any = { isDeleted: false };
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      data: users.map(u => this.toResponse(u)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<UserResponseDto | null> {
    const user = await this.userModel.findOne({ id, isDeleted: false });
    return user ? this.toResponse(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email, isDeleted: false });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto | null> {
    const user = await this.userModel.findOneAndUpdate(
      { id, isDeleted: false },
      { $set: updateUserDto },
      { new: true },
    );
    return user ? this.toResponse(user) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.userModel.findOneAndUpdate(
      { id },
      { $set: { isDeleted: true } },
    );
    return !!result;
  }

  async updateLastLogin(id: string, ip: string): Promise<void> {
    await this.userModel.findOneAndUpdate(
      { id },
      {
        $set: { lastLoginAt: new Date() },
        $push: { loginHistory: { $each: [ip], $slice: -10 } },
      },
    );
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  async changePassword(id: string, newPassword: string): Promise<boolean> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await this.userModel.findOneAndUpdate(
      { id },
      { $set: { password: hashedPassword } },
    );
    return !!result;
  }

  async countByRole(): Promise<Record<string, number>> {
    const results = await this.userModel.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);
    
    return results.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {});
  }

  async bootstrapAdmin(): Promise<void> {
    try {
      const adminExists = await this.userModel.findOne({ 
        email: 'admin@crm.com'
      });
      if (!adminExists) {
        await this.create({
          email: 'admin@crm.com',
          password: 'admin123',
          firstName: 'Master',
          lastName: 'Admin',
          role: UserRole.OWNER,
        });
        console.log('✅ Master admin created: admin@crm.com / admin123');
      }
      
      // Seed Team Lead
      const teamLeadExists = await this.userModel.findOne({ 
        email: 'teamlead@crm.com'
      });
      if (!teamLeadExists) {
        await this.create({
          email: 'teamlead@crm.com',
          password: 'teamlead123',
          firstName: 'Team',
          lastName: 'Lead',
          role: UserRole.TEAM_LEAD,
        });
        console.log('✅ Team Lead created: teamlead@crm.com / teamlead123');
      }
      
      // Seed Manager
      const managerExists = await this.userModel.findOne({ 
        email: 'manager@crm.com'
      });
      if (!managerExists) {
        await this.create({
          email: 'manager@crm.com',
          password: 'manager123',
          firstName: 'Sales',
          lastName: 'Manager',
          role: UserRole.MANAGER,
        });
        console.log('✅ Manager created: manager@crm.com / manager123');
      }
    } catch (error) {
      if (error.code === 11000) {
        console.log('✅ Master admin already exists');
        return;
      }
      console.log('⚠️ Bootstrap admin error:', error.message);
    }
  }

  private toResponse(user: User): UserResponseDto {
    const obj = toObjectResponse(user);
    const { password, passwordResetToken, passwordResetExpires, twoFactorSecret, ...rest } = obj;
    return rest;
  }
}
