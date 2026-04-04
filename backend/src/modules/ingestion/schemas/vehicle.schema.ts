import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';
import { generateId } from '../../../shared/utils';
import { VehicleSource, VehicleStatus } from '../enums/vehicle.enum';

/**
 * Vehicle Schema - нормалізована модель автомобіля
 * 
 * VIN є primary key для дедуплікації
 * Зберігає дані з різних джерел в єдиному форматі
 */
@Schema({ timestamps: true })
export class Vehicle extends MongooseDocument {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  // VIN - PRIMARY KEY для дедуплікації
  @Prop({ required: true, unique: true, index: true })
  vin: string;

  // Джерело
  @Prop({ type: String, enum: Object.values(VehicleSource), required: true, index: true })
  source: VehicleSource;

  // Зовнішній ID (lot number, etc)
  @Prop({ required: true })
  externalId: string;

  // === Основна інформація ===
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop()
  make?: string; // Марка (BMW, Mercedes, etc)

  @Prop()
  vehicleModel?: string; // Модель (renamed to avoid conflict with Mongoose Document.model)

  @Prop()
  year?: number;

  @Prop()
  mileage?: number;

  @Prop()
  mileageUnit?: string; // km, miles

  @Prop()
  color?: string;

  @Prop()
  bodyType?: string; // sedan, suv, hatchback

  @Prop()
  engineType?: string; // petrol, diesel, electric, hybrid

  @Prop()
  transmission?: string; // automatic, manual

  @Prop()
  drivetrain?: string; // fwd, rwd, awd

  // === Ціна ===
  @Prop({ type: Number })
  price?: number;

  @Prop({ default: 'USD' })
  currency?: string;

  @Prop({ type: Number })
  estimatedRetailValue?: number;

  @Prop({ type: Number })
  repairCost?: number;

  // === Зображення ===
  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop()
  primaryImage?: string;

  // === Стан авто ===
  @Prop()
  conditionGrade?: string; // A, B, C, D

  @Prop()
  damageType?: string; // front, rear, side, etc

  @Prop()
  damageDescription?: string;

  @Prop({ default: false })
  hasKeys?: boolean;

  @Prop({ default: true })
  isRunnable?: boolean;

  // === Аукціон ===
  @Prop()
  auctionDate?: Date;

  @Prop()
  auctionLocation?: string;

  @Prop()
  lotNumber?: string;

  @Prop()
  saleStatus?: string; // upcoming, live, sold

  // === Статус в системі ===
  @Prop({ type: String, enum: Object.values(VehicleStatus), default: VehicleStatus.ACTIVE, index: true })
  status: VehicleStatus;

  // === Sync metadata ===
  @Prop({ type: Date, default: Date.now, index: true })
  lastSyncedAt: Date;

  @Prop({ default: 0 })
  syncCount: number;

  @Prop()
  sourceUrl?: string;

  // === Додаткові метадані від парсера ===
  @Prop({ type: Object })
  metadata?: Record<string, any>;

  // === CRM Integration (optional) ===
  @Prop()
  linkedLeadId?: string;

  @Prop()
  linkedDealId?: string;

  @Prop()
  reservedBy?: string; // User ID хто зарезервував

  @Prop()
  reservedAt?: Date;

  // Soft delete
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);

// Indexes для швидких запитів
VehicleSchema.index({ source: 1, status: 1 });
VehicleSchema.index({ make: 1, vehicleModel: 1, year: 1 });
VehicleSchema.index({ price: 1, status: 1 });
VehicleSchema.index({ lastSyncedAt: -1 });
VehicleSchema.index({ createdAt: -1 });
VehicleSchema.index({ 'metadata.category': 1 });
