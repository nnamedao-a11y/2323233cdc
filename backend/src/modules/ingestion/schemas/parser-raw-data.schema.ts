import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { generateId } from '../../../shared/utils';
import { VehicleSource, ProcessingStatus } from '../enums/vehicle.enum';

/**
 * Parser Raw Data Schema
 * 
 * Зберігає сирі дані від парсерів для:
 * - Debug та аналіз
 * - Повторна обробка при помилках
 * - Аудит та безпека
 * - Історія змін
 */
@Schema({ timestamps: true })
export class ParserRawData extends Document {
  @Prop({ type: String, default: () => generateId(), unique: true })
  id: string;

  // Джерело даних
  @Prop({ type: String, enum: Object.values(VehicleSource), required: true, index: true })
  source: VehicleSource;

  // Зовнішній ID з джерела (lot number, etc)
  @Prop({ required: true, index: true })
  externalId: string;

  // VIN (якщо є в payload)
  @Prop({ index: true })
  vin?: string;

  // Сирий payload від парсера
  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  // Статус обробки
  @Prop({ type: String, enum: Object.values(ProcessingStatus), default: ProcessingStatus.PENDING, index: true })
  processingStatus: ProcessingStatus;

  // ID створеного/оновленого vehicle
  @Prop()
  vehicleId?: string;

  // Помилка обробки (якщо є)
  @Prop()
  processingError?: string;

  // Кількість спроб обробки
  @Prop({ default: 0 })
  processingAttempts: number;

  // Час отримання
  @Prop({ type: Date, default: Date.now, index: true })
  receivedAt: Date;

  // Час обробки
  @Prop()
  processedAt?: Date;

  // IP адреса парсера
  @Prop()
  sourceIp?: string;

  // Checksum для дедуплікації
  @Prop({ index: true })
  payloadChecksum?: string;
}

export const ParserRawDataSchema = SchemaFactory.createForClass(ParserRawData);

// Compound index для швидкого пошуку дублікатів
ParserRawDataSchema.index({ source: 1, externalId: 1 });
ParserRawDataSchema.index({ processingStatus: 1, receivedAt: -1 });
ParserRawDataSchema.index({ vin: 1, source: 1 });
