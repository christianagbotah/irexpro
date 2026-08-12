import { test, expect } from '@playwright/test';
import {
  gotoAsAdmin,
  assertNoHorizontalOverflow,
  assertNoConsoleErrors,
  assertBoundingBoxInViewport,
} from './fixtures';

/**
 * Admin Users page responsive E2E — Sprint 31 remediation (architect §6).
 *
 * The architect specifically reported the Users page appeared horizontally
 * laid out on mobile. This spec verifies the ACTUAL rendered DOM at every
 * required viewport:
 *
 *   360 × 800, 390 × 844, 430 × 932, 768 × 1024, 1440 × 900
 *
 * Verifies:
 *   - mobile cards are used (not a cramped 2-col horizontal layout on mobile)
 *   - the page itself does not horizontally overflow
 *   - user identity (name + email/phone) remains readable
 *   - LONG email addresses do not break the viewport (wrap, not overflow)
 *   - status badges remain readable
 *   - cards are clickable (selection works)
 *   - desktop retains the 2-column grid (Users list | Onboarding detail)
 *   - touch targets ≥ 44px on mobile
 */

test.describe('Admin Users page responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    // Wait for the first user card + give the isMobile state effect a tick to
    // settle (post-Sprint-31 hotfix: the Users page now uses an isMobile flag
    // to decide modal vs desktop pane, set via useEffect after mount).
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);
  });

  // ── Layout structure (architect §6 — actual DOM) ───────────────────────────

  test('admin-users-grid collapses to 1 column on mobile, 2 columns on desktop', async ({ page }) => {
    const grid = page.locator('.admin-users-grid').first();
    await expect(grid).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport, 'Page must have a viewport').not.toBeNull();
    if (!viewport) return;

    const cols = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
    const colCount = cols.split(' ').filter(Boolean).length;

    if (viewport.width <= 700) {
      // Mobile: single column (cards stack vertically).
      expect(colCount, `Mobile grid should be 1 column, got ${cols}`).toBe(1);
    } else {
      // Desktop/tablet: 2 columns (Users list | Onboarding detail).
      expect(colCount, `Desktop grid should be 2 columns, got ${cols}`).toBe(2);
    }
  });

  test('user cards render as structured cards, not horizontal inline buttons', async ({ page }) => {
    // Each user is a <button class="admin-user-card"> with a header (identity +
    // badge) and optional meta row. The heading renders before the users fetch
    // resolves, so wait for the first card before asserting.
    const cards = page.locator('.admin-user-card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    const count = await cards.count();
    expect(count, 'Expected at least one user card').toBeGreaterThan(0);

    // The first card should have the structured header (identity + badge).
    const firstCard = cards.first();
    await expect(firstCard.locator('.admin-user-card__header')).toBeVisible();
    await expect(firstCard.locator('.admin-user-card__identity')).toBeVisible();
  });

  // ── No horizontal overflow (architect §6, §12) ─────────────────────────────

  test('users page does not horizontally overflow at any viewport', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  // ── Long email handling (architect §6) ─────────────────────────────────────

  test('long email addresses wrap instead of breaking the viewport', async ({ page }) => {
    // The mock data includes a deliberately long email.
    const longEmail = 'adaezi.okafor.with.a.very.long.email.address@example.com';
    const emailEl = page.locator('.admin-user-card__contact', { hasText: longEmail }).first();

    // The email element should be visible and use overflow-wrap (break-long).
    await expect(emailEl).toBeVisible();
    const styles = await emailEl.evaluate((el) => ({
      overflowWrap: window.getComputedStyle(el).overflowWrap,
      wordBreak: window.getComputedStyle(el).wordBreak,
    }));
    // break-long class sets overflow-wrap: anywhere + word-break: break-word.
    expect(styles.overflowWrap, 'Long email must wrap (overflow-wrap: anywhere)').toMatch(/anywhere|break-word/);

    // The email's right edge must not exceed the viewport width.
    const viewport = page.viewportSize();
    if (viewport) {
      const box = await emailEl.boundingBox();
      expect(box, 'Email element must have a bounding box').not.toBeNull();
      if (box) {
        expect(box.x + box.width, `Email right=${box.x + box.width} must be ≤ viewport width=${viewport.width}`).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
  });

  // ── Identity + status readability (architect §6) ───────────────────────────

  test('user name, contact, and status badge are readable on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const firstCard = page.locator('.admin-user-card').first();
    // Name
    await expect(firstCard.locator('.admin-user-card__name')).toBeVisible();
    // Contact (email or phone)
    await expect(firstCard.locator('.admin-user-card__contact')).toBeVisible();
    // Status badge
    await expect(firstCard.locator('.badge')).toBeVisible();
    // The whole card must be within viewport bounds.
    await assertBoundingBoxInViewport(firstCard);
  });

  // ── Card selection works (actions remain accessible) ───────────────────────

  test('clicking a user card loads onboarding status detail', async ({ page }) => {
    const viewport = page.viewportSize();
    // On mobile, wait for the desktop pane to be hidden (confirms the
    // isMobile effect has run) before clicking — otherwise the click sets
    // selectedUserId but the modal (open = isMobile && selected) doesn't
    // render yet because isMobile is still false (SSR initial state).
    if (viewport && viewport.width <= 700) {
      await expect(page.locator('.admin-users-pane--desktop-only')).toBeHidden({ timeout: 5000 });
    }
    const firstCard = page.locator('.admin-user-card').first();
    await firstCard.click();

    // After clicking, the onboarding-status content should appear. On mobile
    // (≤ 700px) it renders inside the AdminUserOnboardingModal; on desktop
    // it renders in the side-by-side pane. Either way, the "Can start
    // trading:" label should become visible.
    // NOTE: on mobile the desktop pane's <strong>Can start trading:</strong>
    // is in the DOM but hidden (display:none). Use the :visible pseudo-class
    // to pick the visible copy (the modal's on mobile, the pane's on desktop).
    await expect(page.locator('strong:has-text("Can start trading:")').first()).toBeVisible({ timeout: 10000 });
  });

  // ── Touch targets on mobile (WCAG 2.5.5) ────────────────────────────────────

  test('user cards meet 44px minimum touch target on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const cards = page.locator('.admin-user-card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    const count = await cards.count();
    expect(count, 'Expected at least one user card').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box, `Card ${i} has no bounding box`).not.toBeNull();
      if (!box) continue;
      expect(box.height, `Card ${i} height=${box.height} < 44`).toBeGreaterThanOrEqual(44);
    }
  });

  // ── Desktop 2-column layout (architect §6) ─────────────────────────────────

  test('desktop retains 2-column Users + Onboarding layout', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width <= 700) {
      test.skip();
      return;
    }

    // Two cards side by side: "Users (N)" and "Onboarding status".
    const cards = page.locator('.admin-users-grid > .card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator('.card__title', { hasText: /users/i })).toBeVisible();
    await expect(cards.nth(1).locator('.card__title', { hasText: /onboarding/i })).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    assertNoConsoleErrors(page);
  });
});
