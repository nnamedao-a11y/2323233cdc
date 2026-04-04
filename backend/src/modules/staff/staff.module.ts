import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StaffController } from './staff.controller';

@Module({
  imports: [UsersModule],
  controllers: [StaffController],
})
export class StaffModule {}
