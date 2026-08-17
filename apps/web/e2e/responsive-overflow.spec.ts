import { test, expect } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  setupErrorCollectors,
  setupAuthInterception,
  assertNoConsoleErrors,
} from './fixtures';

/**
 * Sprint 31 — Responsive horizontal-overflow E2E coverage.
 *
 * The dashboard, profile, risk, broker, and accessibility specs already
 * assert no-horizontal-overflow on the authenticated pages they cover. This
 * spec fills the gaps for routes that previously had NO overflow assertion:
 *
 *   - Unauthenticated auth routes: /login, /register, /forgot-password,
 *     /reset-password
 *   - Payment callback routes: /payments/success, /payments/cancel,
 *     /payments/callback
 *   - The landing page: /
 *
 * Each route is loaded at every project viewport and asserted to have
 * `document.documentElement.scrollWidth <= clientWidth`.
 *
 * Auth routes are NOT intercepted — they render their default unauthenticated
 * state (the AuthLayout split-screen). The payment callback routes render a
 * simple status card without calling the API.
 *
 * The spec also collects console errors and failed requests so a regression
 * that produces a console error (e.g. a hydration mismatch from unsafe
 * window.innerWidth reads) is caught even if it doesn't cause overflow.
 */

test.describe('Responsive — no horizontal overflow on auth & payment routes', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorCollectors(page);
    // Intercept API calls so no real backend is contacted. Auth routes don't
    // make API calls on first render, but the AuthProvider's mount-time
    // refresh attempt would otherwise produce a network error.
    await setupAuthInterception(page);
  });

  // ── Landing page ─────────────────────────────────────────────────────────

  test('landing page (/) has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /AI-driven forex trading with mandatory risk validation/i,
      }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
  });

  // ── Auth routes (unauthenticated) ────────────────────────────────────────

  test('/login has no horizontal overflow', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
  });

  test('/register has no horizontal overflow', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
  });

  test('/forgot-password has no horizontal overflow', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
  });

  test('/reset-password has no horizontal overflow', async ({ page }) => {
    await page.goto('/reset-password');
    // reset-password may show a heading or an alert depending on the token
    // query param. Wait for the auth layout to render.
    await expect(page.locator('.auth-layout')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
  });

  // ── Payment callback routes ──────────────────────────────────────────────

  test('/payments/success has no horizontal overflow', async ({ page }) => {
    await page.goto('/payments/success');
    await expect(page.getByRole('heading', { level: 1, name: /payment|success|received/i }).or(
      page.getByRole('heading', { level: 1 }).first(),
    )).toBeVisible();
    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
  });

  test('/payments/cancel has no horizontal overflow', async ({ page }) => {
    await page.goto('/payments/cancel');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
  });

  test('/payments/callback has no horizontal overflow', async ({ page }) => {
    await page.goto('/payments/callback');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
  });
});

/**
 * Additional viewport-specific spot checks for the dashboard's bottom-nav
 * spacing. The dashboard.spec.ts already covers /dashboard at every project
 * viewport; this block adds an explicit assertion that the dashboard content
 * has bottom padding ≥ the bottom nav height on mobile (so primary actions
 * are never hidden under the nav).
 */
test.describe('Responsive — dashboard content not hidden behind bottom nav', () => {
  test('dashboard content has bottom padding ≥ bottom nav height on mobile', async ({ page }) => {
    setupErrorCollectors(page);
    await setupAuthInterception(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /welcome back/i })).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport) {
      test.skip();
      return;
    }

    const content = page.locator('.dashboard-content').first();
    const paddingBottom = await content.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).paddingBottom);
    });

    if (viewport.width <= 700) {
      // On mobile the bottom nav is 56px tall + safe-area. The content
      // padding-bottom must be at least 56px so a primary action at the
      // bottom of the content area is not hidden behind the nav.
      expect(
        paddingBottom,
        `Dashboard content padding-bottom=${paddingBottom}px should be ≥ 56px on mobile (viewport ${viewport.width})`,
      ).toBeGreaterThanOrEqual(56);
    } else {
      // On desktop the bottom nav is hidden; the content padding-bottom
      // reverts to the default (no mobile bump). We assert it's the default
      // space-8 = 32px, allowing any value ≤ 56 (i.e. not the mobile bump).
      expect(
        paddingBottom,
        `Dashboard content padding-bottom=${paddingBottom}px should not have the mobile bump on desktop`,
      ).toBeLessThan(56);
    }
  });
});
