import { test, expect } from '@playwright/test';
import {
  gotoAsAuthenticated,
  assertNoHorizontalOverflow,
  assertNoConsoleErrors,
  assertBoundingBoxInViewport,
} from './fixtures';

/**
 * E2E tests for /dashboard.
 *
 * Focus: welcome message, onboarding checklist (with status indicators),
 * status cards (Account / Broker / Subscription), the "Start Paper Trading
 * Session" button (presence + non-promotional styling), and responsive
 * sidebar behaviour (visible on desktop, hidden on mobile per CSS @media).
 */

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAsAuthenticated(page, '/dashboard', { heading: /welcome back/i });
    // Wait for the onboarding card to finish loading.
    await expect(page.locator('.readiness-card, .card', { hasText: /onboarding checklist|trading setup ready/i }).first()).toBeVisible();
  });

  // ── Page-load invariants ──────────────────────────────────────────────────

  test('page loads with authenticated state', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /welcome back/i })).toBeVisible();
  });

  test('no horizontal overflow', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  test('no console errors', async ({ page }) => {
    assertNoConsoleErrors(page);
  });

  // ── Welcome message ───────────────────────────────────────────────────────

  test('welcome message includes the user name', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 1, name: /welcome back/i });
    await expect(heading).toBeVisible();
    // The mock AuthUser has firstName="Adaezi".
    await expect(heading).toContainText('Adaezi');
  });

  // ── Onboarding checklist card ─────────────────────────────────────────────

  test('onboarding checklist card visible', async ({ page }) => {
    await expect(
      page.locator('.card', { hasText: /trading setup ready|complete your onboarding/i }).first(),
    ).toBeVisible();
  });

  test('onboarding steps displayed with status indicators', async ({ page }) => {
    // The checklist is a role="list" with role="listitem" rows.
    const checklist = page.locator('.checklist').first();
    await expect(checklist).toBeVisible();
    const steps = checklist.locator('[role="listitem"]');
    const count = await steps.count();
    expect(count, 'Expected 3 onboarding steps').toBe(3);
    // Each step has an indicator span.
    for (let i = 0; i < count; i++) {
      await expect(steps.nth(i).locator('.checklist__indicator')).toBeVisible();
    }
  });

  // ── Status cards ──────────────────────────────────────────────────────────

  test('status cards (Account, Broker, Performance Fee) visible', async ({ page }) => {
    await expect(page.locator('.card__title', { hasText: /account status/i })).toBeVisible();
    await expect(page.locator('.card__title', { hasText: /broker connection/i })).toBeVisible();
    await expect(page.locator('.card__title', { hasText: /performance fee/i })).toBeVisible();
  });

  // ── Start trading button ──────────────────────────────────────────────────

  test('"Start Paper Trading Session" button visible when canStartTrading=true', async ({ page }) => {
    const startButton = page.getByRole('button', { name: /start paper trading session/i });
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();
  });

  test('Start button is a standard primary button (not promotional/casino-style)', async ({ page }) => {
    const startButton = page.getByRole('button', { name: /start paper trading session/i });
    const className = (await startButton.getAttribute('class')) ?? '';
    expect(className, 'Button should have the btn--primary class').toContain('btn--primary');
    // It must NOT carry promotional / flashy class names.
    const bannedSubstrings = ['casino', 'promotional', 'flashy', 'glow', 'pulse', 'animated', 'cta-'];
    for (const banned of bannedSubstrings) {
      expect(
        className.toLowerCase(),
        `Start button class must not include "${banned}"`,
      ).not.toContain(banned);
    }
    // It must be a real <button> element (not an <a> styled as a button).
    await expect(startButton).toHaveRole('button');
    // No infinite/pulsing CSS animation (casino-style). Check the computed
    // animation-name is not one of the banned patterns.
    const animationInfo = await startButton.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { animationName: cs.animationName, animationDuration: cs.animationDuration };
    });
    const animLower = animationInfo.animationName.toLowerCase();
    const bannedAnimNames = ['pulse', 'flash', 'glow', 'shake', 'bounce'];
    for (const banned of bannedAnimNames) {
      expect(animLower, `Start button must not use ${banned} animation`).not.toContain(banned);
    }
  });

  // ── Layout ────────────────────────────────────────────────────────────────

  test('cards remain within viewport', async ({ page }) => {
    const cards = page.locator('.card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      // Scroll the card into view so the vertical-bounds check is meaningful
      // (the dashboard page scrolls vertically — cards below the fold are
      // valid as long as they're reachable by scrolling, not clipped).
      await card.scrollIntoViewIfNeeded();
      await assertBoundingBoxInViewport(card);
    }
  });

  test('no hidden action buttons caused by viewport size', async ({ page }) => {
    // Every visible "Start" / "Complete" action link/button on the dashboard
    // must be within viewport bounds (no clipped CTAs at small widths).
    const actions = page.locator('a.btn, button.btn');
    const count = await actions.count();
    for (let i = 0; i < count; i++) {
      const action = actions.nth(i);
      // Only check visible actions (skip display:none ones — those are hidden
      // by the framework for valid reasons, e.g. a step that's already done).
      if (await action.isVisible()) {
        await action.scrollIntoViewIfNeeded();
        await assertBoundingBoxInViewport(action);
      }
    }
  });

  // ── Responsive sidebar ────────────────────────────────────────────────────

  test('navigation sidebar visible on desktop, hidden on mobile', async ({ page }) => {
    const sidebar = page.locator('.dashboard-sidebar').first();
    const viewport = page.viewportSize();
    expect(viewport, 'Page must have a viewport').not.toBeNull();
    if (!viewport) return;

    // The CSS rule `@media (max-width: 700px) { .dashboard-sidebar { display: none; } }`
    // hides the sidebar below 700px.
    const display = await sidebar.evaluate((el) => window.getComputedStyle(el).display);

    if (viewport.width <= 700) {
      // Mobile: sidebar must be hidden via display:none.
      expect(
        display,
        `Sidebar should be display:none at viewport width ${viewport.width} (<=700px)`,
      ).toBe('none');
    } else {
      // Desktop/tablet: sidebar must be visible (not display:none).
      expect(
        display,
        `Sidebar should be visible at viewport width ${viewport.width} (>700px), got display=${display}`,
      ).not.toBe('none');
      await expect(sidebar).toBeVisible();
    }
  });
});
