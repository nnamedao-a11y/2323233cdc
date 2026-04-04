/**
 * Favorites Controller
 */

import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { AddFavoriteDto } from './dto/add-favorite.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async add(@Req() req: any, @Body() dto: AddFavoriteDto) {
    return this.favoritesService.add(req.user.id || req.user._id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':vehicleId')
  async remove(@Req() req: any, @Param('vehicleId') vehicleId: string) {
    return this.favoritesService.remove(req.user.id || req.user._id, vehicleId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async mine(@Req() req: any) {
    return this.favoritesService.getMine(req.user.id || req.user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('check/:vehicleId')
  async check(@Req() req: any, @Param('vehicleId') vehicleId: string) {
    const isFavorite = await this.favoritesService.isFavorite(
      req.user.id || req.user._id,
      vehicleId,
    );
    return { isFavorite };
  }

  @UseGuards(JwtAuthGuard)
  @Get('count')
  async count(@Req() req: any) {
    const count = await this.favoritesService.countByUser(req.user.id || req.user._id);
    return { count };
  }
}

@Controller('admin/favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesAdminController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('analytics')
  async analytics() {
    return this.favoritesService.getAdminAnalytics();
  }

  @Get()
  async all(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.favoritesService.getAll(parseInt(page, 10), parseInt(limit, 10));
  }
}
