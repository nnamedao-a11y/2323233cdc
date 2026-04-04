import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CoachingService } from './coaching.service';
import { UserRole } from '../../shared/enums';

@Controller('admin/coaching')
@UseGuards(JwtAuthGuard)
export class CoachingController {
  constructor(private readonly coachingService: CoachingService) {}

  // Get coaching for current user
  @Get('me')
  async getMyCoaching(
    @Req() req: any,
    @Query('period') period?: string,
  ) {
    const periodDays = parseInt(period || '30');
    const user = req.user;

    if (user.role !== UserRole.MANAGER) {
      return { coaching: [], message: 'Coaching is for managers only' };
    }

    return this.coachingService.getCoaching(user.id, periodDays);
  }

  // Get coaching for specific manager (team lead or owner)
  @Get('manager/:id')
  async getManagerCoaching(
    @Req() req: any,
    @Param('id') managerId: string,
    @Query('period') period?: string,
  ) {
    const periodDays = parseInt(period || '30');
    const user = req.user;

    // Only team lead (for their team) or owner can view
    if (user.role === UserRole.MANAGER) {
      return { error: 'Access denied' };
    }

    return this.coachingService.getCoaching(managerId, periodDays);
  }

  // Get urgent coaching (high priority only)
  @Get('urgent')
  async getUrgentCoaching(@Req() req: any) {
    const user = req.user;

    if (user.role !== UserRole.MANAGER) {
      return { coaching: [] };
    }

    return this.coachingService.getUrgentCoaching(user.id);
  }
}
