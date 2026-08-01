export default () => ({
  app: {
    port: parseInt(process.env.APP_PORT ?? '3000', 10),
    host: process.env.APP_HOST ?? '0.0.0.0',
    name: process.env.APP_NAME ?? 'iRexPro API',
    version: process.env.APP_VERSION ?? '0.1.0',
    env: process.env.NODE_ENV ?? 'development',
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(','),
    // Sprint 28: base URL of the web app, used to build password reset links.
    // e.g. https://irexpro.lightworldtech.com
    webBaseUrl: process.env.WEB_BASE_URL,
  },
  // Sprint 28: email provider config (placeholder — not yet wired to a real
  // provider like nodemailer/SendGrid). When EMAIL_SMTP_URL is set, the
  // delivery service will attempt to send via the configured SMTP server.
  email: {
    smtpUrl: process.env.EMAIL_SMTP_URL,
    fromAddress: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@irexpro.com',
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
  paystack: {
    // Fail-closed by default — PAYSTACK_ENABLED must be explicitly 'true' to
    // allow live checkout/webhook verification. Never log this secret.
    enabled: process.env.PAYSTACK_ENABLED === 'true',
    secretKey: process.env.PAYSTACK_SECRET_KEY || undefined,
    // Public key is safe to expose to clients if ever needed; not used server-side.
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || undefined,
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || undefined,
    baseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL || undefined,
  },
  stripe: {
    // Fail-closed by default — STRIPE_ENABLED must be explicitly 'true' to
    // allow live checkout/webhook verification. Never log this secret.
    enabled: process.env.STRIPE_ENABLED === 'true',
    secretKey: process.env.STRIPE_SECRET_KEY || undefined,
    // Publishable key is safe to expose to clients if ever needed; not used server-side.
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || undefined,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    baseUrl: process.env.STRIPE_BASE_URL || 'https://api.stripe.com',
    successUrl: process.env.STRIPE_SUCCESS_URL || undefined,
    cancelUrl: process.env.STRIPE_CANCEL_URL || undefined,
  },
});
