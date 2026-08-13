import { test, expect } from '@playwright/test';
import { gotoAsAdmin, gotoAsNonAdmin } from './fixtures';

/**
 * Post-Sprint-31 hotfix — Rendered Visual QA evidence.
 *
 * Captures non-secret screenshots for VLM visual inspection:
 *   - Access Denied @ 390 (mobile), 768 (tablet), 1440 (desktop)
 *   - Admin Users mobile (list + onboarding modal + after close)
 *   - Admin Users desktop (side-by-side pane)
 *
 * Gated by E2E_CAPTURE_EVIDENCE=1. Uses route-interception auth (no secrets).
 */
const CAPTURE = process.env.E2E_CAPTURE_EVIDENCE === '1';

function evidencePath(width: number, height: number, state: string) {
  return `test-results/evidence/${width}x${height}/${state}.png`;
}

test.describe('Post-Sprint-31 hotfix evidence', () => {
  test.skip(!CAPTURE, 'Set E2E_CAPTURE_EVIDENCE=1 to capture evidence');

  // ── Access Denied (all viewports) ───────────────────────────────────────────
  test('access denied', async ({ page }) => {
    const v = page.viewportSize()!;
    await gotoAsNonAdmin(page, '/admin/dashboard');
    await page.screenshot({ path: evidencePath(v.width, v.height, 'access-denied'), fullPage: false });
  });

  // ── Admin login (Issue D — mobile descriptive panel no internal scrollbar) ─
  test('admin login', async ({ page }) => {
    const v = page.viewportSize()!;
    await page.goto('/admin/login');
    await page.locator('input').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-login'), fullPage: false });
  });

  // ── Admin Users list (mobile only — desktop uses side pane) ────────────────
  test('admin users list mobile', async ({ page }) => {
    const v = page.viewportSize();
    if (!v || v.width > 700) {
      test.skip();
      return;
    }
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-users-list-mobile'), fullPage: false });
  });

  test('admin users onboarding modal mobile', async ({ page }) => {
    const v = page.viewportSize();
    if (!v || v.width > 700) {
      test.skip();
      return;
    }
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.locator('.admin-user-card').first().click();
    await page.locator('.admin-onboarding-modal').waitFor();
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-users-modal-mobile'), fullPage: false });
  });

  test('admin users mobile after close', async ({ page }) => {
    const v = page.viewportSize();
    if (!v || v.width > 700) {
      test.skip();
      return;
    }
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);
    await page.locator('.admin-user-card').first().click();
    await page.locator('.admin-onboarding-modal').waitFor();
    await page.locator('.admin-onboarding-modal .mobile-sheet__close').click();
    await expect(page.locator('.admin-onboarding-modal')).toHaveCount(0);
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-users-after-close-mobile'), fullPage: false });
  });

  // ── Admin Users desktop ────────────────────────────────────────────────────
  test('admin users desktop', async ({ page }) => {
    const v = page.viewportSize();
    if (!v || v.width <= 700) {
      test.skip();
      return;
    }
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    await page.locator('.admin-user-card').first().click();
    await expect(page.getByText('Can start trading:').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'admin-users-desktop'), fullPage: false });
  });
});
