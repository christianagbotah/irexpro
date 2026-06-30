"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSwagger = setupSwagger;
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
function setupSwagger(app) {
    const configService = app.get(config_1.ConfigService);
    const swaggerEnabled = configService.get('swagger.enabled', true);
    if (!swaggerEnabled)
        return;
    const path = configService.get('swagger.path', 'api/docs');
    const config = new swagger_1.DocumentBuilder()
        .setTitle(configService.get('swagger.title', 'iRexPro API'))
        .setDescription(configService.get('swagger.description', 'iRexPro Global AI Forex Trading Platform'))
        .setVersion(configService.get('swagger.version', '0.1.0'))
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization' }, 'access-token')
        .addTag('Auth', 'Authentication endpoints')
        .addTag('Users', 'User profile management')
        .addTag('Subscriptions', 'Subscription management')
        .addTag('Global Config', 'Country and regional configuration')
        .addTag('Health', 'Health check endpoints')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup(path, app, document, {
        swaggerOptions: { persistAuthorization: true },
    });
}
//# sourceMappingURL=swagger.config.js.map