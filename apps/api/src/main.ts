import 'reflect-metadata';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import { createCorrelationId, runWithCorrelationId } from './common/utils/request-correlation.util';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: true preserves the unparsed request body on req.rawBody, which is
  // REQUIRED for payment webhook signature verification
  // (POST /payments/webhooks/:provider). Without this, req.rawBody is undefined
  // and provider signature checks cannot be performed.
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api/v1');
  const port = configService.get<number>('app.port', 3000);
  const host = configService.get<string>('app.host', '0.0.0.0');
  const corsOrigins = configService.get<string[]>('app.corsOrigins', ['http://localhost:3001']);
  const env = configService.get<string>('app.env', 'development');

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
  logger.log(`iRexPro API running on http://${host}:${port}/${apiPrefix}`);
  logger.log(
    `Swagger docs: http://${host}:${port}/${configService.get('swagger.path', 'api/docs')}`,
  );
}

bootstrap();
