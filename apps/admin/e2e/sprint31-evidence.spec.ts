import { test } from '@playwright/test';
import { gotoAsAdmin } from './fixtures';

/**
 * Sprint 31 remediation — Admin screenshot evidence (architect §14).
 *
 * Captures non-secret responsive screenshots of the key Admin pages at the
 * required viewports. Written to test-results/evidence/<width>x<height>/.
 * Uses route-interception admin auth (no real backend, no secrets).
 *
 * Gated by E2E_CAPTURE_EVIDENCE=1.
 *
 * Minimum required set (architect §14):
 *   - dashboard @ 390
 *   - Users @ 390
 *   - Users @ 1440
 *   - Brokers @ 390
 *   - Payments @ 390
 *   - More Sheet @ 390
 */
const CAPTURE = process.env.E2E_CAPTURE_EVIDENCE === '1';

function evidencePath(width: number, height: number, state: string) {
  return `test-results/evidence/${width}x${height}/${state}.png`;
}

test.describe('Sprint 31 Admin evidence screenshots', () => {
  test.skip(!CAPTURE, 'Set E2E_CAPTURE_EVIDENCE=1 to capture evidence');

  test('admin dashboard @ 390', async ({ page }) => {
    await gotoAsAdmin(page, '/admin/dashboard', { heading: /admin dashboard/i });
    const v = page.viewportSize()!;
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-dashboard'), fullPage: false });
  });

  test('admin Users @ 390', async ({ page }) => {
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    const v = page.viewportSize()!;
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-users-mobile'), fullPage: false });
  });

  test('admin Users @ 1440', async ({ page }) => {
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    const v = page.viewportSize()!;
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-users-desktop'), fullPage: false });
  });

  test('admin Brokers @ 390', async ({ page }) => {
    await gotoAsAdmin(page, '/admin/brokers', { heading: /^brokers$/i });
    const v = page.viewportSize()!;
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-brokers'), fullPage: false });
  });

  test('admin Payments @ 390', async ({ page }) => {
    await gotoAsAdmin(page, '/admin/payments', { heading: /^payments$/i });
    const v = page.viewportSize()!;
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-payments'), fullPage: false });
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
