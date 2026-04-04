import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StaffSessionController } from './staff-session.controller';
import { StaffSessionService } from './staff-session.service';
import { StaffSession, StaffSessionSchema } from './staff-session.schema';
import { User, UserSchema } from '../users/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StaffSession.name, schema: StaffSessionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [StaffSessionController],
  providers: [StaffSessionService],
  exports: [StaffSessionService],
})
export class StaffSessionModule {}
