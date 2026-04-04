import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RateLimitMiddleware } from './infrastructure/rate-limit/rate-limit.module';
import { MetricsMiddleware } from './infrastructure/apm/apm.module';
import helmet from 'helmet';
import * as express from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const startTime = Date.now();
  
  logger.log('⚡ BIBI CRM Quick Start v3.1 (with APM & Rate Limiting)...');
  
  // Create app with optimized settings and rawBody enabled for webhooks
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bufferLogs: true,
    rawBody: true, // Enable raw body for webhook signature verification
  });
  
  const configService = app.get(ConfigService);
  
  // Raw body middleware for Stripe webhooks (MUST be before JSON parser)
  app.use('/api/invoices/webhook/stripe', express.raw({ type: 'application/json' }));
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for API
  }));
  
  // Rate limiting middleware
  const rateLimitMiddleware = app.get(RateLimitMiddleware);
  app.use(rateLimitMiddleware.use.bind(rateLimitMiddleware));
  
  // APM metrics middleware
  const metricsMiddleware = app.get(MetricsMiddleware);
  app.use(metricsMiddleware.use.bind(metricsMiddleware));
  
  // CORS - configure based on environment
  const corsOrigins = configService.get('CORS_ORIGINS') || '*';
  app.enableCors({
    origin: corsOrigins === '*' ? '*' : corsOrigins.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global prefix
  app.setGlobalPrefix('api');
  
  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Validation with transform
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // NOTE: Bootstrap/Seed now runs via BootstrapService onModuleInit
  // No manual seed call needed - it's automatic and async

  const port = process.env.PORT || 8001;
  await app.listen(port, '0.0.0.0');
  
  const bootTime = Date.now() - startTime;
  
  logger.log(`╔════════════════════════════════════════════╗`);
  logger.log(`║       BIBI CRM Ready in ${String(bootTime).padStart(4)}ms             ║`);
  logger.log(`╠════════════════════════════════════════════╣`);
  logger.log(`║ API:     http://0.0.0.0:${port}/api               ║`);
  logger.log(`║ Health:  http://0.0.0.0:${port}/api/system/health ║`);
  logger.log(`║ Metrics: http://0.0.0.0:${port}/api/metrics       ║`);
  logger.log(`║ VIN:     http://0.0.0.0:${port}/api/vin/search    ║`);
  logger.log(`╚════════════════════════════════════════════╝`);
}

bootstrap();
