export default () => ({
  app: {
    port: parseInt(process.env.APP_PORT ?? '3000', 10),
    host: process.env.APP_HOST ?? '0.0.0.0',
    name: process.env.APP_NAME ?? 'iRexPro API',
    version: process.env.APP_VERSION ?? '0.1.0',
    env: process.env.NODE_ENV ?? 'development',
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(','),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'irexpro_dev',
    user: process.env.DB_USER ?? 'irexpro',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS ?? '10', 10),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'irexpro:',
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    path: process.env.SWAGGER_PATH ?? 'api/docs',
    title: process.env.SWAGGER_TITLE ?? 'iRexPro API',
    description: process.env.SWAGGER_DESCRIPTION ?? 'iRexPro Global AI Forex Trading Platform',
    version: process.env.SWAGGER_VERSION ?? '0.1.0',
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  cookie: {
    secret: process.env.COOKIE_SECRET,
  },
  broker: {
    encryptionKey: process.env.BROKER_ENCRYPTION_KEY,
    metaApiToken: process.env.METAAPI_TOKEN,
  },
  internalApi: {
    key: process.env.NESTJS_INTERNAL_API_KEY,
  },
  aiEngine: {
    baseUrl: process.env.AI_ENGINE_BASE_URL ?? 'http://localhost:8001/api/v1',
    schedulerEnabled: process.env.AI_ENGINE_SCHEDULER_ENABLED === 'true',
  },
});
