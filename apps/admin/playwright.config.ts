import { defineConfig } from '@playwright/test';

/**
 * iRexPro Admin — Playwright E2E config (Sprint 31 remediation).
 *
 * Mirrors apps/web/playwright.config.ts. The admin app had ZERO e2e coverage
 * before Sprint 31 remediation — this config + the e2e/ specs below establish
 * the admin responsive test suite required by architect §5.
 *
 * Viewports: the required minimum automated matrix (architect §4):
 *   360×800, 390×844, 430×932, 768×1024, 1440×900
 * plus 1024×768 (tablet-landscape) as ADDITIONAL coverage.
 *
 * Auth strategy: route interception (same as web). apps/admin/e2e/fixtures.ts
 * intercepts every /api/v1/** call and fulfills with admin-role fixture data
 * (roles: ['ADMIN']). No real backend, no test passwords, no auth bypass.
 *
 * The e2e server runs on port 3998 (web uses 3999) so both suites can run in
 * parallel without port conflicts.
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
    // ── Mobile (architect §4 required minimum matrix) ──────────────────────
    { name: 'mobile-small', use: { viewport: { width: 360, height: 800 } } },
    { name: 'mobile-standard', use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-large', use: { viewport: { width: 430, height: 932 } } },
    // ── Tablet (architect §13) ───────────────────────────────────────────────
    { name: 'tablet-portrait', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'tablet-landscape', use: { viewport: { width: 1024, height: 768 } } },
    // ── Desktop ───────────────────────────────────────────────────────────────
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'NEXT_PUBLIC_API_BASE_URL=http://localhost:3998/api/v1 npx next start -p 3998',
    port: 3998,
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
  },
});
