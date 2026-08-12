import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3999',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // ── Mobile (architect §4 — required minimum automated viewport matrix) ─────
    { name: 'mobile-small', use: { viewport: { width: 360, height: 800 } } },
    { name: 'mobile-standard', use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-large', use: { viewport: { width: 430, height: 932 } } },
    // ── Tablet (architect §13 — required tablet coverage) ─────────────────────
    { name: 'tablet-portrait', use: { viewport: { width: 768, height: 1024 } } },
    // tablet-landscape (1024×768) is retained as ADDITIONAL coverage; it does
    // NOT replace the required 430×932 viewport (architect §4).
    { name: 'tablet-landscape', use: { viewport: { width: 1024, height: 768 } } },
    // ── Desktop ───────────────────────────────────────────────────────────────
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'NEXT_PUBLIC_API_BASE_URL=http://localhost:3999/api/v1 npx next start -p 3999',
    port: 3999,
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
  },
});
