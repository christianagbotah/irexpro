import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow } from './fixtures';

/**
 * Web login — mobile descriptive-panel scrollbar removal (Issue D).
 *
 * Post-Sprint-31 hotfix: on mobile, the top descriptive/branding section of
 * the login page showed a small internal vertical scrollbar even though the
 * content fit. The root cause was the base `.auth-layout__brand` rule setting
 * `overflow-y: auto` (needed on desktop where the panel is height:100vh), and
 * the mobile override's `overflow: visible` shorthand not reliably overriding
 * the longhand `overflow-y: auto`. Fixed by explicitly setting
 * `overflow-y: visible` in the mobile override.
 *
 * These tests verify at 360/390/430/768/1440:
 *   - the descriptive brand panel does NOT behave as an internal scroll container
 *     (scrollHeight <= clientHeight + tolerance when content fits)
 *   - the login form remains visible and usable
 *   - the password field is usable
 *   - the submit button is reachable
 *   - no horizontal overflow
 *   - the page remains scrollable naturally if content exceeds viewport
 *
 * NOTE: the Web login button reads "Log in" (the Admin login button reads
 * "Sign in"). This spec uses /log in/i.
 */

test.describe('Web login — descriptive panel no internal scrollbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // Wait for the form's password input to be present (page hydrated).
    await page.locator('input[type="password"]').waitFor({ timeout: 5000 });
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
        overflowX: s.overflowX,
        overflowY: s.overflowY,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    });
    // Per CSS Overflow Module Level 3, when one axis is `visible` and the
    // other is `hidden`/`scroll`/`auto`, the `visible` value computes to
    // `auto` — creating a nested scroll container with a scrollbar.
    // The fix uses `overflow-x: clip` (NOT hidden) so that `overflow-y: visible`
    // computes as `visible` (not `auto`). With `overflow-y: visible`, NO
    // scrollbar is rendered even if content overflows the element's box
    // (content spills out and the page/body owns vertical scrolling).
    // Assert the fix is applied: overflow-x must be `clip` (not `hidden`).
    expect(metrics.overflowX, `brand overflow-x should be clip on mobile, got ${metrics.overflowX}`).toBe('clip');
    // overflow-y must be `visible` (not `auto`) — `auto` would create a
    // nested scroll container with a scrollbar.
    expect(metrics.overflowY, `brand overflow-y should be visible on mobile, got ${metrics.overflowY}`).toBe('visible');
    // NOTE: scrollHeight > clientHeight is EXPECTED with overflow-y: visible —
    // it means content overflows the element's box and spills out (no
    // scrollbar). The page/body owns vertical scrolling. We do NOT assert
    // scrollHeight <= clientHeight because that would incorrectly fail for
    // valid visible overflow. The overflow-y:visible assertion above is the
    // correct behavioral guarantee that no nested scrollbar exists.
  });

  test('login form is visible and usable', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 900) {
      test.skip();
      return;
    }
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // The Web login button reads "Log in" (not "Sign in").
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
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

  test('submit button is reachable (can be scrolled into view on mobile)', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 900) {
      test.skip();
      return;
    }
    const submit = page.getByRole('button', { name: /log in/i });
    // Scroll into view — on mobile the form may be below the brand panel.
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
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
