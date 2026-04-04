/**
 * Alert Settings Schema
 * 
 * Stores notification preferences for each user
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class AlertSettings extends Document {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop()
  userRole: string; // owner, team_lead, manager

  // Telegram settings
  @Prop()
  telegramChatId: string;

  @Prop({ default: true })
  telegramEnabled: boolean;

  // Email settings
  @Prop()
  email: string;

  @Prop({ default: false })
  emailEnabled: boolean;

  // Alert preferences by priority
  @Prop({ default: true })
  receiveCritical: boolean;

  @Prop({ default: true })
  receiveHigh: boolean;

  @Prop({ default: true })
  receiveMedium: boolean;

  @Prop({ default: false })
  receiveLow: boolean;

  // Specific event types enabled
  @Prop({ type: [String], default: [] })
  enabledEvents: string[];

  @Prop({ type: [String], default: [] })
  disabledEvents: string[];

  // Quiet hours
  @Prop({ default: false })
  quietHoursEnabled: boolean;

  @Prop()
  quietHoursStart: string; // "22:00"

  @Prop()
  quietHoursEnd: string; // "08:00"

  // Team filter (for team leads)
  @Prop({ type: [String], default: [] })
  teamMemberIds: string[];

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const AlertSettingsSchema = SchemaFactory.createForClass(AlertSettings);

AlertSettingsSchema.index({ userId: 1 }, { unique: true });
AlertSettingsSchema.index({ userRole: 1 });
AlertSettingsSchema.index({ telegramChatId: 1 });
