/**
 * iRexPro — PM2 Ecosystem (production, VPS / Webuzo)
 *
 * This file contains NO secrets. All real secrets are read from the .env
 * files on the server (apps/api/.env and services/ai-engine/.env), which are
 * gitignored and never committed. See docs/runbooks/production-deployment-vps-webuzo.md
 * for the full deployment procedure and docs/runbooks/secrets-never-committed.md
 * for the secrets policy.
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
    {
      name: 'irexpro-ai-engine',
      cwd: '/opt/irexpro/services/ai-engine',
      script: '.venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8001 --workers 1',
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
