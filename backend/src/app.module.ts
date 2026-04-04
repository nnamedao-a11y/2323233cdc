import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { CacheModule } from './infrastructure/cache/cache.module';
import { DatabaseOptimizationModule } from './infrastructure/database/database-optimization.module';
import { RateLimitModule } from './infrastructure/rate-limit/rate-limit.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { ApmModule } from './infrastructure/apm/apm.module';

// ═══════════════════════════════════════════════════════════════════
// ZOHO-STYLE CORE MODULES (Event Bus, Blueprint, Routing, Cadence, Journey, Score)
// ═══════════════════════════════════════════════════════════════════
import { EventBusModule } from './modules/event-bus/event-bus.module';
import { BlueprintModule } from './modules/blueprint/blueprint.module';
import { RoutingModule } from './modules/routing/routing.module';
import { CadenceModule } from './modules/cadence/cadence.module';
import { JourneyModule } from './modules/journey/journey.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { LeadsModule } from './modules/leads/leads.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DealsModule } from './modules/deals/deals.module';
import { DepositsModule } from './modules/deposits/deposits.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotesModule } from './modules/notes/notes.module';
import { TagsModule } from './modules/tags/tags.module';
import { StaffModule } from './modules/staff/staff.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { SettingsModule } from './modules/settings/settings.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { AutomationModule } from './modules/automation/automation.module';
import { CallCenterModule } from './modules/call-center/call-center.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { ExportModule } from './modules/export/export.module';
import { LeadRoutingModule } from './modules/lead-routing/lead-routing.module';
import { FilesModule } from './modules/files/files.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ActivityModule } from './modules/activity/activity.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IngestionAdminModule } from './modules/ingestion/admin/ingestion-admin.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { VinEngineModule } from './modules/vin-engine/vin-engine.module';
import { VinUnifiedModule } from './modules/vin-unified/vin-unified.module';
import { SourceRegistryModule } from './modules/source-registry/source-registry.module';
import { SourceDiscoveryModule } from './modules/source-discovery/source-discovery.module';
import { CompetitorParsingModule } from './modules/competitor-parsing/competitor-parsing.module';
import { AuctionRankingModule } from './modules/auction-ranking/auction-ranking.module';
import { CalculatorModule } from './modules/calculator/calculator.module';
import { QuoteAnalyticsModule } from './modules/analytics/quote-analytics.module';
import { DomainEventsModule } from './infrastructure/events/domain-events.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { CustomerCabinetModule } from './modules/customer-cabinet/customer-cabinet.module';
import { AiModule } from './modules/ai/ai.module';
import { CustomerAuthModule } from './modules/customer-auth/customer-auth.module';
import { AiSeoModule } from './modules/ai-seo/ai-seo.module';
import { TelegramBotModule } from './modules/telegram-bot/telegram-bot.module';
import { ViberBotModule } from './modules/viber-bot/viber.module';
import { NotificationOrchestratorModule } from './modules/notification-orchestrator/notification-orchestrator.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { RevenueAiModule } from './modules/revenue-ai/revenue-ai.module';
import { AnalyticsTrackingModule } from './modules/analytics-tracking/analytics-tracking.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { ParsingMeshModule } from './modules/parsing-mesh/parsing-mesh.module';
import { VinPriceModule } from './modules/price-engine/price-engine.module';
import { VinResolverModule } from './modules/vin-resolver/vin-resolver.module';
import { VinResolverV2Module } from './modules/vin-resolver-v2/vin-resolver-v2.module';
import { UserEngagementModule } from './modules/user-engagement/user-engagement.module';
import { ReminderWorkflowModule } from './modules/reminder-workflow/reminder-workflow.module';
import { ManagerAIModule } from './modules/manager-ai/manager-ai.module';
import { DealEngineModule } from './modules/deal-engine/deal-engine.module';
import { AutoCallModule } from './modules/auto-call/auto-call.module';
import { SmartCampaignModule } from './modules/smart-campaign/smart-campaign.module';
import { RevenueAdvisorModule } from './modules/revenue-advisor/revenue-advisor.module';
import { KPIModule } from './modules/kpi/kpi.module';
import { ResponseTimeModule } from './modules/response-time/response-time.module';
import { CoachingModule } from './modules/coaching/coaching.module';
import { PredictiveLeadModule } from './modules/predictive-leads/predictive-lead.module';
import { CallFlowModule } from './modules/call-flow/call-flow.module';
import { HistoryReportModule } from './modules/history-reports/history-report.module';
import { StaffSessionModule } from './modules/staff-sessions/staff-session.module';
import { StaffAuthModule } from './modules/staff-auth/staff-auth.module';
import { CarfaxModule } from './modules/carfax/carfax.module';
import { RingostatModule } from './modules/ringostat/ringostat.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AdvancedAnalyticsModule } from './modules/analytics/advanced-analytics.module';
import { RiskControlModule } from './modules/risk/risk-control.module';
import { DocusignModule } from './modules/docusign/docusign.module';
import { LoginApprovalModule } from './modules/login-approval/login-approval.module';
import { PaymentFlowModule } from './modules/payment-flow/payment-flow.module';
import { InvoiceReminderModule } from './modules/invoice-reminders/invoice-reminder.module';
import { ShipmentAlertsModule } from './modules/shipment-alerts/shipment-alerts.module';
import { OwnerDashboardModule } from './modules/owner-dashboard/owner-dashboard.module';
// Production Hardening Modules
import { SystemErrorModule } from './modules/system-errors/system-error.module';
import { IntegrationConfigModule } from './modules/integration-config/integration-config.module';
import { RetryQueueModule } from './modules/retry-queue/retry-queue.module';
import { WebhookSyncModule } from './modules/webhook-sync/webhook-sync.module';
import { ShippingTrackerModule } from './modules/shipping-tracker/shipping-tracker.module';
import { SessionModule } from './modules/sessions/session.module';
import { TeamWorkspaceModule } from './modules/team-workspace/team-workspace.module';
// Escalation Engine
import { EscalationModule } from './modules/escalation/escalation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URL'),
        dbName: configService.get<string>('DB_NAME'),
        // Connection pooling optimization
        maxPoolSize: 100,           // Maximum connections in pool
        minPoolSize: 10,            // Minimum connections to maintain
        maxIdleTimeMS: 30000,       // Close idle connections after 30s
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        retryReads: true,
      }),
      inject: [ConfigService],
    }),
    
    // ═══════════════════════════════════════════════════════════════════
    // CACHING LAYER (In-memory, Redis-ready)
    // ═══════════════════════════════════════════════════════════════════
    CacheModule.forRoot(),
    
    // ═══════════════════════════════════════════════════════════════════
    // DATABASE OPTIMIZATION (Indexes, Pooling)
    // ═══════════════════════════════════════════════════════════════════
    DatabaseOptimizationModule,
    
    // ═══════════════════════════════════════════════════════════════════
    // REDIS (Production Cache)
    // ═══════════════════════════════════════════════════════════════════
    RedisModule,
    
    // ═══════════════════════════════════════════════════════════════════
    // RATE LIMITING (API Protection)
    // ═══════════════════════════════════════════════════════════════════
    RateLimitModule,
    
    // ═══════════════════════════════════════════════════════════════════
    // APM (Application Performance Monitoring)
    // ═══════════════════════════════════════════════════════════════════
    ApmModule,
    
    // ═══════════════════════════════════════════════════════════════════
    // ZOHO-STYLE CORE (Event Bus MUST be first!)
    // ═══════════════════════════════════════════════════════════════════
    EventBusModule,
    BlueprintModule,
    RoutingModule,
    CadenceModule,
    JourneyModule,
    ScoringModule,
    
    // ═══════════════════════════════════════════════════════════════════
    // BOOTSTRAP & INFRASTRUCTURE
    // ═══════════════════════════════════════════════════════════════════
    BootstrapModule,
    QueueModule,
    AuthModule,
    UsersModule,
    RolesModule,
    LeadsModule,
    CustomersModule,
    DealsModule,
    DepositsModule,
    TasksModule,
    NotesModule,
    TagsModule,
    StaffModule,
    NotificationsModule,
    DashboardModule,
    AuditLogModule,
    SettingsModule,
    RemindersModule,
    AutomationModule,
    CallCenterModule,
    CommunicationsModule,
    ExportModule,
    LeadRoutingModule,
    FilesModule,
    DocumentsModule,
    ActivityModule,
    IngestionModule,
    IngestionAdminModule,
    PipelineModule,
    VinEngineModule,
    VinUnifiedModule,  // NEW: Unified VIN pipeline
    SourceRegistryModule,
    SourceDiscoveryModule,
    CompetitorParsingModule,
    AuctionRankingModule,
    CalculatorModule,
    QuoteAnalyticsModule,
    DomainEventsModule,
    PublishingModule,
    CustomerCabinetModule,
    AiModule,
    CustomerAuthModule,
    AiSeoModule,
    TelegramBotModule,
    ViberBotModule,
    NotificationOrchestratorModule,
    RecommendationsModule,
    RevenueAiModule,
    AnalyticsTrackingModule,
    MarketingModule,
    ParsingMeshModule,
    VinPriceModule,
    VinResolverModule,
    VinResolverV2Module,
    UserEngagementModule,
    ReminderWorkflowModule,
    ManagerAIModule,
    DealEngineModule,
    AutoCallModule,
    SmartCampaignModule,
    RevenueAdvisorModule,
    KPIModule,
    CoachingModule,
    PredictiveLeadModule,
    CallFlowModule,
    HistoryReportModule,
    StaffSessionModule,
    StaffAuthModule,
    CarfaxModule,
    RingostatModule,
    PaymentsModule,
    ContractsModule,
    ShippingModule,
    AlertsModule,
    AdvancedAnalyticsModule,
    RiskControlModule,
    DocusignModule,
    LoginApprovalModule,
    PaymentFlowModule,
    InvoiceReminderModule,
    ShipmentAlertsModule,
    OwnerDashboardModule,
    // Production Hardening Modules
    SystemErrorModule,
    IntegrationConfigModule,
    RetryQueueModule,
    WebhookSyncModule,
    ShippingTrackerModule,
    SessionModule,
    TeamWorkspaceModule,
    // Escalation Engine
    EscalationModule,
    // Response Time Tracking
    ResponseTimeModule,
  ],
})
export class AppModule {}
