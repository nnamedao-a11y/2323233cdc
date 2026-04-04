import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tag } from './tag.schema';
import { toObjectResponse, toArrayResponse, generateId } from '../../shared/utils';

@Injectable()
export class TagsService {
  constructor(@InjectModel(Tag.name) private tagModel: Model<Tag>) {}

  async create(data: any): Promise<any> {
    const tag = new this.tagModel({ id: generateId(), ...data });
    return toObjectResponse(await tag.save());
  }

  async findAll(): Promise<any[]> {
    const tags = await this.tagModel.find({ isDeleted: false });
    return toArrayResponse(tags);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.tagModel.findOneAndUpdate({ id }, { $set: { isDeleted: true } });
    return !!result;
  }
}
