import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TelegramLinkDocument = TelegramLink & Document;

/**
 * TelegramLink Schema
 * 
 * Links CRM users and customers to their Telegram chat IDs
 */

@Schema({ timestamps: true, collection: 'telegramlinks' })
export class TelegramLink {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ index: true })
  userId?: string; // CRM user (manager)

  @Prop({ index: true })
  customerId?: string; // Customer

  @Prop({ required: true, unique: true, index: true })
  telegramChatId: string;

  @Prop()
  telegramUsername?: string;

  @Prop()
  telegramFirstName?: string;

  @Prop()
  telegramLastName?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: true })
  notificationsEnabled: boolean;

  @Prop({ type: Object, default: {} })
  preferences: {
    auctionAlerts?: boolean;
    priceAlerts?: boolean;
    dealAlerts?: boolean;
    leadAlerts?: boolean;
    recommendations?: boolean;
  };

  @Prop()
  linkedAt: Date;

  @Prop()
  lastMessageAt?: Date;
}

export const TelegramLinkSchema = SchemaFactory.createForClass(TelegramLink);

TelegramLinkSchema.index({ telegramChatId: 1 }, { unique: true });
