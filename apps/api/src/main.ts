import 'reflect-metadata';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import type { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createCorrelationId, runWithCorrelationId } from './common/utils/request-correlation.util';
import { handleBootstrapFailure } from './config/bootstrap-failure';
import { isTrustedReverseProxy } from './config/proxy-trust';
import { setupSwagger } from './config/swagger.config';

const bootstrapLogger = new Logger('Bootstrap');

async function bootstrap() {
  // rawBody: true preserves the unparsed request body on req.rawBody, which is
  // REQUIRED for payment webhook signature verification
  // (POST /payments/webhooks/:provider). Without this, req.rawBody is undefined
  // and provider signature checks cannot be performed.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    rawBody: true,
  });

  // Make the API request-body ceiling explicit instead of depending on the
  // Express default. Nest's useBodyParser() preserves the rawBody option, so
  // signed webhook verification keeps access to the exact received bytes.
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb' });

  // Route SIGINT/SIGTERM through Nest's lifecycle so framework-managed
  // resources receive their orderly shutdown callbacks during deployments.
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api/v1');
  const port = configService.get<number>('app.port', 3000);
  const env = configService.get<string>('app.env', 'development');
  const host = configService.get<string>(
    'app.host',
    env === 'production' ? '127.0.0.1' : '0.0.0.0',
  );
  const corsOrigins = configService.get<string[]>('app.corsOrigins', ['http://localhost:3001']);

  // The verified VPS topology has exactly one reverse proxy hop: same-host
  // Nginx connects to NestJS over loopback. Trust forwarded client metadata
  // only from that immediate loopback peer; direct/public/private-network
  // callers cannot make Express honor arbitrary X-Forwarded-For values.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', isTrustedReverseProxy);

  app.setGlobalPrefix(apiPrefix);
  app.useWebSocketAdapter(new IoAdapter(app));

  // Server-owned request correlation. Never reuse a caller-supplied request ID:
  // doing so would allow forged correlation between unrelated audit/log events.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = createCorrelationId();
    res.setHeader('X-Correlation-Id', correlationId);
    runWithCorrelationId(correlationId, next);
  });

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser(configService.get<string>('cookie.secret')));

  // CORS
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Correlation-Id'],
    credentials: true,
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Serialiser — strips @Exclude() fields (e.g. passwordHash, mfaSecret)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Swagger
  if (env !== 'production') {
    setupSwagger(app);
  }

  await app.listen(port, host);
  bootstrapLogger.log(`iRexPro API running on http://${host}:${port}/${apiPrefix}`);
  bootstrapLogger.log(
    `Swagger docs: http://${host}:${port}/${configService.get('swagger.path', 'api/docs')}`,
  );
}

void bootstrap().catch(() => {
  handleBootstrapFailure(bootstrapLogger);
});
