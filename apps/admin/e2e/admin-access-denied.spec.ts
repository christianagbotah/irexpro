import { test, expect } from '@playwright/test';
import {
  gotoAsNonAdmin,
  assertNoHorizontalOverflow,
  assertNoConsoleErrors,
} from './fixtures';

/**
 * Access Denied responsive tests — post-Sprint-31 hotfix (Issue A).
 *
 * Verifies the access-denied shell renders a balanced, centered card at
 * desktop/tablet widths (not a tiny far-left block), and preserves good
 * mobile layout. The backend RolesGuard is unchanged; this only exercises
 * the frontend presentation.
 *
 * Architect §18:
 *   - Mobile (390): existing responsive behavior preserved.
 *   - Desktop (1440): card occupies/balances the content area, sensible
 *     width, not pinned far-left, Sign Out visible, long email/role
 *     content does not overflow.
 *
 * Viewports: 390×844 (mobile), 768×1024 (tablet), 1440×900 (desktop).
 */

test.describe('Admin Access Denied responsive', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAsNonAdmin(page, '/admin/dashboard');
  });

  // ── All viewports: card is visible + Sign Out present ─────────────────────

  test('access denied card is visible with Sign Out button', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /access denied/i })).toBeVisible();
    await expect(page.getByText(/insufficient permissions/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  // ── No horizontal overflow at any viewport ────────────────────────────────

  test('no horizontal overflow', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  // ── Desktop/tablet: card is centered, not far-left ───────────────────────

  test('desktop/tablet: card is horizontally centered (not far-left)', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width <= 700) {
      test.skip();
      return;
    }

    const card = page.locator('.access-denied-card');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box, 'card must have a bounding box').not.toBeNull();
    if (!box) return;

    // The card should be roughly centered: its left margin should be within
    // ~30% of the viewport width on either side (i.e. not pinned to the far
    // left with a huge empty region to the right).
    const leftMargin = box.x;
    const rightMargin = viewport.width - (box.x + box.width);
    const center = viewport.width / 2;
    const cardCenter = box.x + box.width / 2;

    // The card's center should be within 15% of the viewport center.
    const tolerance = viewport.width * 0.15;
    expect(
      Math.abs(cardCenter - center),
      `card center=${cardCenter} should be near viewport center=${center} (±${tolerance}px); leftMargin=${leftMargin}, rightMargin=${rightMargin}`,
    ).toBeLessThanOrEqual(tolerance);

    // The card should have a sensible max-width (not stretched full-width).
    expect(box.width, `card width=${box.width} should be ≤ 600`).toBeLessThanOrEqual(600);
    expect(box.width, `card width=${box.width} should be ≥ 300`).toBeGreaterThanOrEqual(300);
  });

  // ── Mobile: card is top-aligned, not vertically centered (no clip) ────────

  test('mobile: card is top-aligned (not vertically centered)', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const card = page.locator('.access-denied-card');
    const box = await card.boundingBox();
    expect(box, 'card must have a bounding box').not.toBeNull();
    if (!box) return;

    // On mobile, the card should be near the top (not vertically centered,
    // which could clip on short viewports).
    expect(box.y, `card top=${box.y} should be ≤ 120 (top-aligned on mobile)`).toBeLessThanOrEqual(120);
  });

  // ── Long email/role content does not overflow ────────────────────────────

  test('long email and role content does not overflow the viewport', async ({ page }) => {
    const card = page.locator('.access-denied-card');
    const box = await card.boundingBox();
    expect(box, 'card must have a bounding box').not.toBeNull();
    if (!box) return;
    const viewport = page.viewportSize();
    if (!viewport) return;

    // The card's right edge must be within the viewport.
    expect(box.x + box.width, `card right=${box.x + box.width} must be ≤ viewport width=${viewport.width}`).toBeLessThanOrEqual(viewport.width + 1);
  });

  // ── Humanized role labels (Issue C) ────────────────────────────────────────

  test('role label is humanized (User, not USER)', async ({ page }) => {
    // The mock non-admin user has roles: ['USER']. The rendered text should
    // be "User" (humanized), not "USER" (raw enum).
    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'raw enum USER should NOT appear in user-facing text').not.toContain('USER');
    expect(bodyText, 'humanized "User" should appear').toContain('User');
  });

  test('no console errors', async ({ page }) => {
    assertNoConsoleErrors(page);
  });
});
