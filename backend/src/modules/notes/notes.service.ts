import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Note } from './note.schema';
import { toObjectResponse, toArrayResponse, generateId } from '../../shared/utils';

@Injectable()
export class NotesService {
  constructor(@InjectModel(Note.name) private noteModel: Model<Note>) {}

  async create(data: any, userId: string): Promise<any> {
    const note = new this.noteModel({ id: generateId(), ...data, createdBy: userId });
    return toObjectResponse(await note.save());
  }

  async findByEntity(entityType: string, entityId: string): Promise<any[]> {
    const notes = await this.noteModel.find({ entityType, entityId, isDeleted: false }).sort({ createdAt: -1 });
    return toArrayResponse(notes);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.noteModel.findOneAndUpdate({ id }, { $set: { isDeleted: true } });
    return !!result;
  }
}
