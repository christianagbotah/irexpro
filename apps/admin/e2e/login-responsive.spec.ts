import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow } from './fixtures';

/**
 * Admin login — mobile descriptive-panel scrollbar removal (Issue D).
 *
 * Post-Sprint-31 hotfix: on mobile, the top descriptive/branding section of
 * the admin login page showed a small internal vertical scrollbar even though
 * the content fit. Same root cause as Web login (shared auth-layout CSS
 * pattern, duplicated in admin globals.css). Fixed by explicitly setting
 * `overflow-y: visible` in the mobile override.
 *
 * Mirrors apps/web/e2e/login-responsive.spec.ts.
 */

test.describe('Admin login — descriptive panel no internal scrollbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('input').first().waitFor({ timeout: 5000 });
  });

  test('brand panel does not have an internal vertical scrollbar at mobile widths', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 900) {
      test.skip();
      return;
    }
    const brand = page.locator('.auth-layout__brand');
    const metrics = await brand.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        overflowY: s.overflowY,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    });
    expect(metrics.overflowY, `brand overflow-y should be visible on mobile, got ${metrics.overflowY}`).toBe('visible');
    expect(
      metrics.scrollHeight,
      `brand scrollHeight=${metrics.scrollHeight} should be ≤ clientHeight=${metrics.clientHeight} (no internal scroll)`,
    ).toBeLessThanOrEqual(metrics.clientHeight + 2);
  });

  test('login form is visible and usable', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 900) {
      test.skip();
      return;
    }
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('password field is usable (can receive input)', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 900) {
      test.skip();
      return;
    }
    const password = page.locator('input[type="password"]');
    await password.fill('test-password');
    await expect(password).toHaveValue('test-password');
  });

  test('submit button is reachable (in viewport bounds on mobile)', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 900) {
      test.skip();
      return;
    }
    const submit = page.getByRole('button', { name: /sign in/i });
    const box = await submit.boundingBox();
    expect(box, 'submit button must have a bounding box').not.toBeNull();
    if (!box) return;
    expect(box.y).toBeGreaterThanOrEqual(-1);
    await submit.scrollIntoViewIfNeeded();
    const boxAfter = await submit.boundingBox();
    expect(boxAfter, 'submit button bounding box after scroll').not.toBeNull();
  });

  test('no horizontal overflow at any viewport', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  test('page remains scrollable naturally when content exceeds viewport (mobile)', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 900) {
      test.skip();
      return;
    }
    const htmlOverflowY = await page.evaluate(() => getComputedStyle(document.documentElement).overflowY);
    expect(htmlOverflowY, 'html overflow-y should not be hidden (page must scroll naturally)').not.toBe('hidden');
  });

  // ── Desktop preservation ──────────────────────────────────────────────────

  test('desktop: brand panel retains its professional split-screen layout', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width <= 900) {
      test.skip();
      return;
    }
    const layout = page.locator('.auth-layout');
    const flexDirection = await layout.evaluate((el) => getComputedStyle(el).flexDirection);
    expect(flexDirection, 'desktop auth-layout should be row (split-screen)').toBe('row');
    await expect(page.locator('.auth-layout__brand')).toBeVisible();
    await expect(page.locator('.auth-layout__form-side')).toBeVisible();
  });
});
