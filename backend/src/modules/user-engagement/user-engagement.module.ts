/**
 * User Engagement Module
 * 
 * Включає:
 * - Favorites (улюблені авто)
 * - Compare (порівняння до 3 авто)
 * - History Access Layer (history reports з anti-abuse)
 * - Campaign (масові розсилки)
 * 
 * API:
 * - POST   /api/favorites           - Додати в улюблені
 * - DELETE /api/favorites/:vehicleId - Видалити з улюблених
 * - GET    /api/favorites/me        - Мої улюблені
 * - GET    /api/favorites/check/:vehicleId - Перевірити чи в улюблених
 * 
 * - POST   /api/compare/add         - Додати до порівняння
 * - DELETE /api/compare/remove/:vehicleId - Видалити з порівняння
 * - DELETE /api/compare/clear       - Очистити порівняння
 * - GET    /api/compare/me          - Мій список порівняння
 * - POST   /api/compare/resolve     - Отримати таблицю порівняння
 * 
 * - POST   /api/history/request     - Запит history report (verified only)
 * - GET    /api/history/report/:vin - Отримати report по VIN
 * - GET    /api/history/quota/me    - Моя quota
 * 
 * Admin API:
 * - GET    /api/admin/favorites/analytics
 * - GET    /api/admin/compare/analytics
 * - GET    /api/admin/history/analytics
 * - GET    /api/admin/engagement/top-vehicles
 * - GET    /api/admin/engagement/top-users
 * - GET    /api/admin/engagement/audience
 * - POST   /api/admin/engagement/campaign
 * - GET    /api/admin/engagement/templates
 * - GET    /api/admin/engagement/history
 * - GET    /api/admin/engagement/analytics
 */

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { Favorite, FavoriteSchema } from './favorites/schemas/favorite.schema';
import { CompareList, CompareListSchema } from './compare/schemas/compare-list.schema';
import { VehicleHistoryRequest, VehicleHistoryRequestSchema } from './history/schemas/vehicle-history-request.schema';
import { VehicleHistoryReport, VehicleHistoryReportSchema } from './history/schemas/vehicle-history-report.schema';
import { UserHistoryQuota, UserHistoryQuotaSchema } from './history/schemas/user-history-quota.schema';
import { EngagementCampaign, EngagementCampaignSchema } from './campaign/schemas/engagement-campaign.schema';
import { IntentScore, IntentScoreSchema } from '../reminder-workflow/schemas/intent-score.schema';

// Favorites
import { FavoritesController, FavoritesAdminController } from './favorites/favorites.controller';
import { FavoritesService } from './favorites/favorites.service';

// Compare
import { CompareController, CompareAdminController } from './compare/compare.controller';
import { CompareService } from './compare/compare.service';

// History
import { HistoryController, HistoryAdminController } from './history/history.controller';
import { HistoryService } from './history/history.service';
import { HistoryProviderService } from './history/history-provider.service';
import { HistoryRiskService } from './history/history-risk.service';
import { HistoryQuotaService } from './history/history-quota.service';

// Campaign
import { EngagementCampaignController } from './campaign/engagement-campaign.controller';
import { EngagementCampaignService } from './campaign/engagement-campaign.service';

// Security
import { VerifiedUserGuard } from './security/verified-user.guard';

// External modules
import { AutoCallModule } from '../auto-call/auto-call.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Favorite.name, schema: FavoriteSchema },
      { name: CompareList.name, schema: CompareListSchema },
      { name: VehicleHistoryRequest.name, schema: VehicleHistoryRequestSchema },
      { name: VehicleHistoryReport.name, schema: VehicleHistoryReportSchema },
      { name: UserHistoryQuota.name, schema: UserHistoryQuotaSchema },
      { name: EngagementCampaign.name, schema: EngagementCampaignSchema },
      { name: IntentScore.name, schema: IntentScoreSchema },
    ]),
    forwardRef(() => AutoCallModule),
    forwardRef(() => TelegramBotModule),
  ],
  controllers: [
    // User-facing
    FavoritesController,
    CompareController,
    HistoryController,
    // Admin
    FavoritesAdminController,
    CompareAdminController,
    HistoryAdminController,
    EngagementCampaignController,
  ],
  providers: [
    // Favorites
    FavoritesService,
    // Compare
    CompareService,
    // History
    HistoryService,
    HistoryProviderService,
    HistoryRiskService,
    HistoryQuotaService,
    // Campaign
    EngagementCampaignService,
    // Security
    VerifiedUserGuard,
  ],
  exports: [
    FavoritesService,
    CompareService,
    HistoryService,
    HistoryQuotaService,
    EngagementCampaignService,
  ],
})
export class UserEngagementModule {}
