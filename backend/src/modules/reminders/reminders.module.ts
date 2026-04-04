import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';

// Reminders are handled as tasks with isReminder=true
@Module({
  imports: [TasksModule],
  exports: [TasksModule],
})
export class RemindersModule {}
