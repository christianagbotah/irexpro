"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const helmet_1 = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const app_module_1 = require("./app.module");
const swagger_config_1 = require("./config/swagger.config");
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger: ['log', 'error', 'warn', 'debug'] });
    const configService = app.get(config_1.ConfigService);
    const apiPrefix = configService.get('app.apiPrefix', 'api/v1');
    const port = configService.get('app.port', 3000);
    const corsOrigins = configService.get('app.corsOrigins', ['http://localhost:3001']);
    const env = configService.get('app.env', 'development');
    app.setGlobalPrefix(apiPrefix);
    app.use((0, helmet_1.default)());
    app.use(compression());
    app.use(cookieParser(configService.get('cookie.secret')));
    app.enableCors({
        origin: corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalInterceptors(new common_1.ClassSerializerInterceptor(app.get(core_1.Reflector)));
    if (env !== 'production') {
        (0, swagger_config_1.setupSwagger)(app);
    }
    await app.listen(port);
    logger.log(`iRexPro API running on http://localhost:${port}/${apiPrefix}`);
    logger.log(`Swagger docs: http://localhost:${port}/${configService.get('swagger.path', 'api/docs')}`);
}
bootstrap();
//# sourceMappingURL=main.js.map