import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SeoClusterService } from './seo-cluster.service';
import { ClusterType } from './schemas/seo-cluster.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * SEO Cluster Controller
 * 
 * Public endpoints for SEO cluster pages
 * Admin endpoints for management
 */

@Controller('seo-clusters')
export class SeoClusterController {
  constructor(private readonly clusterService: SeoClusterService) {}

  // ============ PUBLIC ENDPOINTS ============

  @Get('public')
  async getPublicClusters(@Query('type') type?: ClusterType) {
    return this.clusterService.getPublicClusters(type);
  }

  @Get('public/:slug')
  async getClusterBySlug(@Param('slug') slug: string) {
    return this.clusterService.getClusterBySlug(slug);
  }

  // ============ ADMIN ENDPOINTS ============

  @Post('rebuild')
  @UseGuards(JwtAuthGuard)
  async rebuildClusters() {
    const result = await this.clusterService.rebuildClusters();
    return { success: true, ...result };
  }
}
