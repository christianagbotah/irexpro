import { defineConfig } from '@playwright/test';

/**
 * iRexPro Admin — Playwright E2E config (Sprint 31 remediation).
 *
 * Mirrors apps/web/playwright.config.ts. The admin app had ZERO e2e coverage
 * before Sprint 31 remediation — this config + the e2e specs establish the
 * admin responsive test suite.
 *
 * Auth strategy: route interception (same as web). No real backend, no test
 * passwords, and no auth bypass.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3998',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-small', use: { viewport: { width: 360, height: 800 } } },
    { name: 'mobile-standard', use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-large', use: { viewport: { width: 430, height: 932 } } },
    { name: 'tablet-portrait', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'tablet-air', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'tablet-ipad', use: { viewport: { width: 834, height: 1194 } } },
    { name: 'tablet-pro-portrait', use: { viewport: { width: 1024, height: 1366 } } },
    { name: 'tablet-landscape', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'NEXT_PUBLIC_API_BASE_URL=http://localhost:3998/api/v1 npx next start -p 3998',
    port: 3998,
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
  },
});
