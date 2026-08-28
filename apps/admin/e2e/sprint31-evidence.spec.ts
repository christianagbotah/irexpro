import { test } from '@playwright/test';
import { gotoAsAdmin } from './fixtures';

/**
 * Sprint 31 closure — Admin Rendered Visual QA evidence (architect §6).
 *
 * Captures non-secret responsive screenshots of all reachable Admin routes at
 * mobile (390) and desktop (1440) widths. Uses route-interception admin auth
 * (roles: ['ADMIN']). Gated by E2E_CAPTURE_EVIDENCE=1.
 */
const CAPTURE = process.env.E2E_CAPTURE_EVIDENCE === '1';

function evidencePath(width: number, height: number, state: string) {
  return `test-results/evidence/${width}x${height}/${state}.png`;
}

test.describe('Sprint 31 closure — Admin evidence', () => {
  test.skip(!CAPTURE, 'Set E2E_CAPTURE_EVIDENCE=1 to capture evidence');

  // ── Admin auth routes (no auth interception) ───────────────────────────────
  test('admin login @ 390', async ({ page }) => {
    const v = page.viewportSize()!;
    await page.goto('/admin/login');
    // AuthLayout renders two h1s — wait for the form input instead.
    await page.locator('input').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-login'), fullPage: false });
  });

  // ── Admin protected routes (admin auth interception) ───────────────────────
  test('admin dashboard @ 390', async ({ page }) => {
    const v = page.viewportSize()!;
    await gotoAsAdmin(page, '/admin/dashboard', { heading: /admin dashboard/i });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-dashboard'), fullPage: false });
  });

  test('admin dashboard @ 1440', async ({ page }) => {
    const v = page.viewportSize()!;
    await gotoAsAdmin(page, '/admin/dashboard', { heading: /admin dashboard/i });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-dashboard'), fullPage: false });
  });

  test('admin Users @ 390', async ({ page }) => {
    const v = page.viewportSize()!;
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-users-mobile'), fullPage: false });
  });

  test('admin Users @ 1440', async ({ page }) => {
    const v = page.viewportSize()!;
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-users-desktop'), fullPage: false });
  });

  test('admin Brokers @ 390', async ({ page }) => {
    const v = page.viewportSize()!;
    await gotoAsAdmin(page, '/admin/brokers', { heading: /^brokers$/i });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-brokers'), fullPage: false });
  });

  test('admin Payments @ 390', async ({ page }) => {
    const v = page.viewportSize()!;
    await gotoAsAdmin(page, '/admin/payments', { heading: /^payments$/i });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-payments'), fullPage: false });
  });

  test('admin Audit @ 390', async ({ page }) => {
    const v = page.viewportSize()!;
    await gotoAsAdmin(page, '/admin/audit', { heading: /^audit log$/i });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-audit'), fullPage: false });
  });

  test('admin More Sheet @ 390', async ({ page }) => {
    const v = page.viewportSize();
    if (!v || v.width > 700) {
      test.skip();
      return;
    }
    await gotoAsAdmin(page, '/admin/dashboard', { heading: /admin dashboard/i });
    await page.locator('.mobile-bottom-nav__item[aria-label="More admin navigation"]').click();
    await page.locator('#admin-mobile-more-sheet').waitFor();
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-more-sheet'), fullPage: false });
  });
});
