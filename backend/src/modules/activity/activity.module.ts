import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from './schemas/activity.schema';
import { ActivityService } from './services/activity.service';
import { ActivityAggregatorService } from './services/activity-aggregator.service';
import { ActivityController } from './controllers/activity.controller';

@Global() // Робимо глобальним, щоб ActivityService був доступний всюди
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
    ]),
  ],
  controllers: [ActivityController],
  providers: [ActivityService, ActivityAggregatorService],
  exports: [ActivityService, ActivityAggregatorService],
})
export class ActivityModule {}
