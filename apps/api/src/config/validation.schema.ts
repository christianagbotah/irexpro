import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  APP_PORT: Joi.number().default(3000),
  APP_HOST: Joi.string().default('0.0.0.0'),
  APP_NAME: Joi.string().default('iRexPro API'),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3001'),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_MAX_CONNECTIONS: Joi.number().default(10),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_DB: Joi.number().default(0),
  REDIS_KEY_PREFIX: Joi.string().default('irexpro:'),

  SWAGGER_ENABLED: Joi.boolean().default(true),
  SWAGGER_PATH: Joi.string().default('api/docs'),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  COOKIE_SECRET: Joi.string().min(16).required(),

  // Broker credential encryption (AES-256-GCM)
  // Must be at least 32 characters (256 bits).
  // In production: managed by AWS KMS / HashiCorp Vault.
  BROKER_ENCRYPTION_KEY: Joi.string().min(32).required(),

  // MetaAPI platform token — ONE token for the entire platform (not per-user)
  // Obtain from: https://app.metaapi.cloud/api-access/generate-token
  // In production: store in AWS Secrets Manager / HashiCorp Vault
  METAAPI_TOKEN: Joi.string().optional().allow(''),

  // Internal API key for Python AI Engine → NestJS communication.
  // Must match NESTJS_INTERNAL_API_KEY in services/ai-engine/.env.
  // In production: store in AWS Secrets Manager / HashiCorp Vault.
  NESTJS_INTERNAL_API_KEY: Joi.string().optional().allow(''),

  // Python AI engine scheduler coordination (NestJS → AI engine)
  AI_ENGINE_BASE_URL: Joi.string().default('http://localhost:8001/api/v1'),
  AI_ENGINE_SCHEDULER_ENABLED: Joi.boolean().default(false),

  // Paystack sandbox integration (Sprint 15) — fail-closed by default.
  // PAYSTACK_SECRET_KEY must never be logged or returned; only present in local .env.
  PAYSTACK_ENABLED: Joi.boolean().default(false),
  PAYSTACK_SECRET_KEY: Joi.string().optional().allow(''),
  PAYSTACK_PUBLIC_KEY: Joi.string().optional().allow(''),
  PAYSTACK_WEBHOOK_SECRET: Joi.string().optional().allow(''),
  PAYSTACK_BASE_URL: Joi.string().default('https://api.paystack.co'),
  PAYSTACK_CALLBACK_URL: Joi.string().optional().allow(''),

  // Stripe sandbox integration (Sprint 17) — fail-closed by default.
  // STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET must never be logged or returned;
  // only present in local .env. The app must boot without either being set.
  STRIPE_ENABLED: Joi.boolean().default(false),
  STRIPE_SECRET_KEY: Joi.string().optional().allow(''),
  STRIPE_PUBLISHABLE_KEY: Joi.string().optional().allow(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional().allow(''),
  STRIPE_BASE_URL: Joi.string().default('https://api.stripe.com'),
  STRIPE_SUCCESS_URL: Joi.string().optional().allow(''),
  STRIPE_CANCEL_URL: Joi.string().optional().allow(''),
});
