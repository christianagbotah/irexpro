/**
 * iRexPro — PM2 Ecosystem (production, VPS / Webuzo)
 *
 * This file contains NO secrets. All real secrets are read from the .env
 * files on the server (apps/api/.env and services/ai-engine/.env), which are
 * gitignored and never committed. See docs/runbooks/production-deployment-vps-webuzo.md
 * for the full deployment procedure and docs/runbooks/secrets-never-committed.md
 * for the secrets policy.
 *
 * Sprint 21 staging-verified findings (AlmaLinux 9.8 / Webuzo):
 *   - NestJS API port: 3010 (set APP_PORT=3010 in apps/api/.env; the API reads
 *     APP_PORT, not PORT, as the source of truth).
 *   - AI engine port: 8011 (set AI_ENGINE_PORT=8011 in services/ai-engine/.env;
 *     the uvicorn --port arg below OVERRIDES the env var, so keep them in sync).
 *   - AI engine uvicorn entrypoint: app.main:app (NOT main:app or src.main:app).
 *   - AI engine binds to 127.0.0.1 ONLY — it is internal, never publicly proxied.
 *   - After starting: pm2 save && pm2 startup && systemctl daemon-reload &&
 *     systemctl reset-failed pm2-root && systemctl restart pm2-root.
 *     See docs/runbooks/production-deployment-vps-webuzo.md §7.1.1.
 *
 * Usage:
 *   pm2 start infrastructure/pm2/ecosystem.config.js
 *   pm2 save
 *   pm2 startup      # follow printed instructions to enable boot-on-start
 *
 * Logs:
 *   pm2 logs irexpro-api
 *   pm2 logs irexpro-ai-engine
 *
 * Restart after deploy:
 *   pm2 restart ecosystem.config.js
 *
 * Log rotation (install once):
 *   pm2 install pm2-logrotate
 *   pm2 set pm2-logrotate:max_size 50M
 *   pm2 set pm2-logrotate:retain 14
 */
module.exports = {
  apps: [
    // ── NestJS API ────────────────────────────────────────────────────────
    // Port: read from APP_PORT in apps/api/.env (staging-verified: 3010).
    // The API does NOT take a --port CLI arg; it reads APP_PORT via
    // @nestjs/config. Do not reuse frontend ports (3005/3006) for the API.
    {
      name: 'irexpro-api',
      cwd: '/opt/irexpro/apps/api',
      script: 'dist/main.js',
      instances: 1, // single instance — BullMQ + Socket.IO sticky sessions
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      // .env is loaded automatically by @nestjs/config (dotenv) — no need to
      // inline secrets here. Do NOT add env vars that duplicate .env values.
      // APP_PORT, DB_USER, DB_PASSWORD, JWT_SECRET, BROKER_ENCRYPTION_KEY, etc.
      // all come from apps/api/.env.
      error_file: '/var/log/irexpro/api-error.log',
      out_file: '/var/log/irexpro/api-out.log',
      merge_logs: true,
      time: true,
      // Ensure unhandled rejections/rejections crash the process so PM2
      // restarts it cleanly — never swallow a crash in a trading/payments system.
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: false,
    },

    // ── Python AI Engine ──────────────────────────────────────────────────
    // Entrypoint: app.main:app (the `app` package, `main` module, `app` object).
    //   Do NOT use main:app or src.main:app — they fail with ModuleNotFoundError.
    // Port: the --port arg below OVERRIDES AI_ENGINE_PORT in .env, so keep them
    //   in sync. Staging-verified: 8011. Bind to 127.0.0.1 ONLY (never 0.0.0.0).
    // AI_ENGINE_ENV=production, AI_SIGNAL_MODE=paper, AI_ALLOW_MOCK_MARKET_DATA=false
    //   are read from services/ai-engine/.env by pydantic-settings.
    {
      name: 'irexpro-ai-engine',
      cwd: '/opt/irexpro/services/ai-engine',
      script: '.venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8011 --workers 1',
      interpreter: 'none', // run the venv uvicorn binary directly
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G',
      env: {
        AI_ENGINE_ENV: 'production',
      },
      // .env is loaded by pydantic-settings (python-dotenv) from
      // services/ai-engine/.env — no secrets here.
      // AI_ENGINE_PORT, REDIS_PASSWORD, NESTJS_INTERNAL_API_KEY, etc. all
      // come from services/ai-engine/.env. Note: the --port arg above is the
      // actual listening port (it overrides AI_ENGINE_PORT); keep them in sync.
      error_file: '/var/log/irexpro/ai-engine-error.log',
      out_file: '/var/log/irexpro/ai-engine-out.log',
      merge_logs: true,
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: false,
    },
  ],
};
