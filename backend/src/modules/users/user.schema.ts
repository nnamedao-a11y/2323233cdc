import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole } from '../../shared/enums';
import { generateId } from '../../shared/utils';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.MANAGER })
  role: UserRole;

  // === HIERARCHY FIELDS ===
  @Prop({ type: String, index: true })
  teamLeadId?: string; // Manager belongs to this Team Lead

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  phone?: string;

  @Prop()
  avatar?: string;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ type: [String], default: [] })
  loginHistory: string[];

  @Prop({ default: false })
  twoFactorEnabled: boolean;

  @Prop()
  twoFactorSecret?: string;

  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  // === ASSIGNMENT FIELDS ===
  @Prop({ type: Boolean, default: true })
  isAvailableForAssignment: boolean;

  @Prop({ type: Number })
  assignmentPriority?: number;

  @Prop({ type: [String], default: [] })
  supportedMarkets: string[];

  @Prop({ type: [String], default: [] })
  supportedLanguages: string[];

  @Prop({ type: [String], default: [] })
  supportedLeadSources: string[];

  @Prop({ type: Number })
  maxActiveLeads?: number;

  @Prop({ type: Number, default: 0 })
  currentActiveLeads: number;

  @Prop({ type: Number, default: 0 })
  currentOpenTasks: number;

  @Prop({ type: Number, default: 0 })
  currentOverdueTasks: number;

  @Prop()
  lastAssignedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ isAvailableForAssignment: 1, isActive: 1 });
UserSchema.index({ lastAssignedAt: 1 });
