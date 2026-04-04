/**
 * Compare Controller
 */

import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CompareService } from './compare.service';
import { AddCompareItemDto } from './dto/add-compare-item.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('compare')
export class CompareController {
  constructor(private readonly compareService: CompareService) {}

  @UseGuards(JwtAuthGuard)
  @Post('add')
  async add(@Req() req: any, @Body() dto: AddCompareItemDto) {
    return this.compareService.add(req.user.id || req.user._id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('remove/:vehicleId')
  async remove(@Req() req: any, @Param('vehicleId') vehicleId: string) {
    return this.compareService.remove(req.user.id || req.user._id, vehicleId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('clear')
  async clear(@Req() req: any) {
    return this.compareService.clear(req.user.id || req.user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async mine(@Req() req: any) {
    return this.compareService.mine(req.user.id || req.user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resolve')
  @HttpCode(200)
  async resolve(@Req() req: any) {
    // TODO: інтегрувати з VehiclesService для отримання повних даних
    return this.compareService.resolve(req.user.id || req.user._id, async (ids) => {
      // Поки повертаємо snapshots
      const list = await this.compareService.mine(req.user.id || req.user._id);
      return (list as any).items?.map((item: any) => ({
        vehicleId: item.vehicleId,
        vin: item.vin,
        ...item.snapshot,
      })) || [];
    });
  }
}

@Controller('admin/compare')
@UseGuards(JwtAuthGuard)
export class CompareAdminController {
  constructor(private readonly compareService: CompareService) {}

  @Get('analytics')
  async analytics() {
    return this.compareService.getAdminAnalytics();
  }
}
