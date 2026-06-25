import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function setupSwagger(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const swaggerEnabled = configService.get<boolean>('swagger.enabled', true);

  if (!swaggerEnabled) return;

  const path = configService.get<string>('swagger.path', 'api/docs');

  const config = new DocumentBuilder()
    .setTitle(configService.get<string>('swagger.title', 'iRexPro API'))
    .setDescription(
      configService.get<string>('swagger.description', 'iRexPro Global AI Forex Trading Platform'),
    )
    .setVersion(configService.get<string>('swagger.version', '0.1.0'))
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization' },
      'access-token',
    )
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User profile management')
    .addTag('Subscriptions', 'Subscription management')
    .addTag('Global Config', 'Country and regional configuration')
    .addTag('Health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
