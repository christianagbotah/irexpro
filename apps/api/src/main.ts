import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';

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
  const corsOrigins = configService.get<string[]>('app.corsOrigins', ['http://localhost:3001']);
  const env = configService.get<string>('app.env', 'development');

  app.setGlobalPrefix(apiPrefix);
  app.useWebSocketAdapter(new IoAdapter(app));

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser(configService.get<string>('cookie.secret')));

  // CORS
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  await app.listen(port);
  logger.log(`iRexPro API running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger docs: http://localhost:${port}/${configService.get('swagger.path', 'api/docs')}`);
}

bootstrap();
