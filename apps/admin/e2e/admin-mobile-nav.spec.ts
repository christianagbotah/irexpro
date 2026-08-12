import { test, expect } from '@playwright/test';
import {
  gotoAsAdmin,
  assertNoHorizontalOverflow,
  assertNoConsoleErrors,
  assertBoundingBoxInViewport,
} from './fixtures';

/**
 * Admin mobile bottom navigation E2E — Sprint 31 remediation (architect §5).
 *
 * Verifies the admin responsive navigation:
 *   - Mobile bottom nav visible only on small viewports (≤ 700px)
 *   - Desktop sidebar hidden on mobile, visible on desktop
 *   - Primary destinations: Dashboard, Users, Brokers, Payments, More
 *   - More sheet: Subscriptions, Audit log, Log out
 *   - Sheet: role="dialog", aria-modal, focus trap, body scroll lock
 *   - Active route via aria-current="page"
 *   - No horizontal overflow; touch targets ≥ 44px
 *
 * Runs across all 6 viewport projects (360, 390, 430, 768, 1024, 1440).
 */

test.describe('Admin mobile bottom navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAsAdmin(page, '/admin/dashboard', { heading: /admin dashboard/i });
  });

  // ── Visibility across viewports ─────────────────────────────────────────────

  test('bottom nav visible on mobile, hidden on desktop', async ({ page }) => {
    const bottomNav = page.locator('.mobile-bottom-nav').first();
    const viewport = page.viewportSize();
    expect(viewport, 'Page must have a viewport').not.toBeNull();
    if (!viewport) return;

    const display = await bottomNav.evaluate((el) => window.getComputedStyle(el).display);

    if (viewport.width <= 700) {
      expect(display, `Bottom nav should be flex at width ${viewport.width} (≤700px), got ${display}`).toBe('flex');
      await expect(bottomNav).toBeVisible();
    } else {
      expect(display, `Bottom nav should be none at width ${viewport.width} (>700px), got ${display}`).toBe('none');
    }
  });

  test('desktop sidebar hidden on mobile, visible on desktop', async ({ page }) => {
    const sidebar = page.locator('.sidebar').first();
    const viewport = page.viewportSize();
    expect(viewport, 'Page must have a viewport').not.toBeNull();
    if (!viewport) return;

    const display = await sidebar.evaluate((el) => window.getComputedStyle(el).display);

    if (viewport.width <= 700) {
      expect(display, `Sidebar should be none at width ${viewport.width} (≤700px)`).toBe('none');
    } else {
      expect(display, `Sidebar should be visible at width ${viewport.width} (>700px)`).not.toBe('none');
    }
  });

  // ── Primary destinations ───────────────────────────────────────────────────

  test('bottom nav contains 5 primary destinations on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const bottomNav = page.locator('.mobile-bottom-nav').first();
    // 4 primary <a> items (Dashboard, Users, Brokers, Payments) + 1 More button.
    const items = bottomNav.locator('.mobile-bottom-nav__item');
    await expect(items).toHaveCount(5);

    const labels = (await items.allTextContents()).map((s) => s.trim().toLowerCase());
    const joined = labels.join(' | ');
    expect(joined, `Expected admin primary destinations, got: ${joined}`).toContain('dashboard');
    expect(joined).toContain('users');
    expect(joined).toContain('brokers');
    expect(joined).toContain('payments');
    expect(joined).toContain('more');
  });

  test('active route indicated with aria-current="page" on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    // On /admin/dashboard, the Dashboard item should be active.
    const dashboardItem = page.locator('.mobile-bottom-nav__item').first();
    await expect(dashboardItem).toHaveAttribute('aria-current', 'page');
    await expect(dashboardItem).toHaveClass(/mobile-bottom-nav__item--active/);
  });

  // ── Touch target sizing (WCAG 2.5.5) ─────────────────────────────────────────

  test('bottom nav items meet 44px minimum touch target on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const items = page.locator('.mobile-bottom-nav__item');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box, `Item ${i} has no bounding box`).not.toBeNull();
      if (!box) continue;
      expect(box.height, `Item ${i} height=${box.height} < 44`).toBeGreaterThanOrEqual(44);
      expect(box.width, `Item ${i} width=${box.width} < 44`).toBeGreaterThanOrEqual(44);
    }
  });

  // ── "More" sheet ────────────────────────────────────────────────────────────

  test('More button opens accessible bottom sheet on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const moreButton = page.getByRole('button', { name: /more admin navigation/i });
    await expect(moreButton).toBeVisible();
    await expect(moreButton).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(moreButton).toHaveAttribute('aria-expanded', 'false');
    await expect(moreButton).toHaveAttribute('aria-controls', 'admin-mobile-more-sheet');

    await moreButton.click();

    const sheet = page.locator('#admin-mobile-more-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('role', 'dialog');
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet).toHaveAttribute('aria-labelledby', 'admin-mobile-more-sheet-title');
    await expect(moreButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('More sheet contains Subscriptions, Audit, Log out', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    await page.getByRole('button', { name: /more admin navigation/i }).click();
    const sheet = page.locator('#admin-mobile-more-sheet');
    await expect(sheet).toBeVisible();

    const items = sheet.locator('.mobile-sheet__item');
    const count = await items.count();
    expect(count, 'Expected 2 secondary destinations + logout').toBeGreaterThanOrEqual(3);

    const labels = (await items.allTextContents()).map((s) => s.trim().toLowerCase());
    const joined = labels.join(' | ');
    expect(joined, `Expected secondary destinations, got: ${joined}`).toContain('subscriptions');
    expect(joined).toContain('audit');
    expect(joined).toContain('log out');
  });

  test('More sheet closes on Escape and restores focus to trigger', async ({ page, browserName }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }
    test.skip(browserName === 'webkit', 'Focus restoration timing on webkit is flaky');

    const moreButton = page.getByRole('button', { name: /more admin navigation/i });
    await moreButton.click();
    const sheet = page.locator('#admin-mobile-more-sheet');
    await expect(sheet).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(moreButton).toBeFocused();
  });

  test('More sheet closes on overlay click', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    await page.getByRole('button', { name: /more admin navigation/i }).click();
    const sheet = page.locator('#admin-mobile-more-sheet');
    await expect(sheet).toBeVisible();

    const overlay = page.locator('.mobile-sheet-overlay');
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(sheet).toHaveCount(0);
  });

  // ── Focus trap + body scroll lock (architect §9) ────────────────────────────

  test('More sheet traps focus: Tab wraps from last to first', async ({ page, browserName }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }
    test.skip(browserName === 'webkit', 'Focus timing on webkit is flaky');

    // Class-based trigger selector avoids regex ambiguity (the regex
    // /more admin navigation/i also matches the close button's aria-label).
    const moreButton = page.locator('.mobile-bottom-nav__item[aria-label="More admin navigation"]');
    await moreButton.click();
    const sheet = page.locator('#admin-mobile-more-sheet');
    await expect(sheet).toBeVisible();

    // Focus the last focusable (Log out), Tab forward → wraps to first (Close).
    const logoutButton = sheet.locator('.mobile-sheet__item--danger');
    await logoutButton.focus();
    await expect(logoutButton).toBeFocused();

    await page.keyboard.press('Tab');

    const closeButton = sheet.locator('.mobile-sheet__close');
    await expect(closeButton).toBeFocused();
    await expect(moreButton).not.toBeFocused();
  });

  test('More sheet locks body scroll while open and restores on close', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const overflowBefore = await page.evaluate(() => document.body.style.overflow);
    expect(overflowBefore).not.toBe('hidden');

    const moreButton = page.locator('.mobile-bottom-nav__item[aria-label="More admin navigation"]');
    await moreButton.click();
    const sheet = page.locator('#admin-mobile-more-sheet');
    await expect(sheet).toBeVisible();

    const overflowDuring = await page.evaluate(() => document.body.style.overflow);
    expect(overflowDuring, 'Body overflow must be hidden while sheet is open').toBe('hidden');

    // Close via the close button (class selector — unambiguous).
    await sheet.locator('.mobile-sheet__close').click();
    await expect(sheet).toHaveCount(0);

    const overflowAfter = await page.evaluate(() => document.body.style.overflow);
    expect(overflowAfter, 'Body overflow must be restored after sheet closes').not.toBe('hidden');
  });

  // ── Layout invariants ───────────────────────────────────────────────────────

  test('no horizontal overflow on admin dashboard', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  test('no console errors', async ({ page }) => {
    assertNoConsoleErrors(page);
  });

  test('bottom nav items within viewport bounds on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const items = page.locator('.mobile-bottom-nav__item');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await assertBoundingBoxInViewport(items.nth(i));
    }
  });

  test('bottom nav does not overlap last dashboard card on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const bottomNav = page.locator('.mobile-bottom-nav').first();
    const navBox = await bottomNav.boundingBox();
    expect(navBox, 'Bottom nav must have a bounding box').not.toBeNull();
    if (!navBox) return;

    // Scroll to bottom and verify the last card is not hidden behind the nav.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);

    const cards = page.locator('.card:visible, .stat-card:visible');
    const count = await cards.count();
    if (count === 0) return; // dashboard may render stat-cards only
    const lastCard = cards.nth(count - 1);
    const cardRect = await lastCard.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    expect(cardRect.bottom, `Last card bottom=${cardRect.bottom} should be ≤ nav top=${navBox.y}`).toBeLessThanOrEqual(navBox.y + 1);
  });
});
