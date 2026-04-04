import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationRuleDocument = NotificationRule & Document;

@Schema({ timestamps: true })
export class NotificationRule {
  @Prop({ required: true, unique: true, index: true })
  eventType: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true, enum: ['info', 'warning', 'critical'] })
  severity: 'info' | 'warning' | 'critical';

  @Prop({ 
    type: Object, 
    default: { inApp: true, telegram: false, sound: false, email: false } 
  })
  channels: {
    inApp: boolean;
    telegram: boolean;
    sound: boolean;
    email: boolean;
  };

  @Prop({ type: [String], default: [] })
  targetRoles: string[];

  @Prop()
  soundKey?: string;

  @Prop({ default: 10 })
  debounceMinutes: number;

  @Prop({ default: true })
  enabledForOwner: boolean;

  @Prop({ default: true })
  enabledForTeamLead: boolean;

  @Prop({ default: true })
  enabledForManager: boolean;

  @Prop()
  titleTemplate?: string;

  @Prop()
  messageTemplate?: string;
}

export const NotificationRuleSchema = SchemaFactory.createForClass(NotificationRule);
