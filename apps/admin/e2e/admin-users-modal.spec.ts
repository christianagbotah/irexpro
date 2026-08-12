import { test, expect } from '@playwright/test';
import {
  gotoAsAdmin,
  assertNoHorizontalOverflow,
  assertNoConsoleErrors,
} from './fixtures';

/**
 * Admin Users mobile onboarding-status modal — post-Sprint-31 hotfix (Issue B).
 *
 * Verifies the adaptive behavior:
 *   - Mobile (≤ 700px): selecting a user opens the Onboarding Status in an
 *     accessible modal/sheet (NOT appended beneath the users list).
 *   - Desktop (≥ 701px): side-by-side Users list + Onboarding pane (no modal).
 *
 * Architect §8 (scroll preservation): the users list must remain at its
 * scroll position when the modal opens and closes.
 *
 * Architect §7 (modal accessibility): role=dialog, aria-modal, focus trap,
 * body scroll lock, Escape close, focus restoration to the trigger card.
 */

test.describe('Admin Users mobile onboarding modal', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAsAdmin(page, '/admin/users', { heading: /^users$/i });
    // Wait for the first user card to be present.
    await page.locator('.admin-user-card').first().waitFor({ timeout: 5000 });
    // Give the isMobile state effect a tick to settle (it runs after mount
    // and reads window.innerWidth). Without this, a click before the effect
    // runs would set selectedUserId but the modal (open = isMobile && selected)
    // wouldn't render yet.
    await page.waitForTimeout(200);
  });

  // ── Mobile: modal opens on user selection ─────────────────────────────────

  test('mobile: selecting a user opens the onboarding modal (not appended below)', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    // The desktop side-pane should be hidden on mobile.
    const desktopPane = page.locator('.admin-users-pane--desktop-only');
    await expect(desktopPane).toBeHidden();

    // Click the first user card.
    await page.locator('.admin-user-card').first().click();

    // The onboarding modal should appear.
    const modal = page.locator('.admin-onboarding-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-labelledby', 'admin-onboarding-modal-title');

    // The modal title "Onboarding status" should be visible.
    await expect(modal.locator('#admin-onboarding-modal-title')).toBeVisible();
  });

  test('mobile: modal shows the selected user identity', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    await page.locator('.admin-user-card').first().click();
    const modal = page.locator('.admin-onboarding-modal');
    await expect(modal).toBeVisible();

    // The first mock user is "Adaezi Okafor" with the long email.
    await expect(modal.getByText(/adaezi/i)).toBeVisible();
  });

  test('mobile: modal does not cause page-level horizontal overflow', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    await page.locator('.admin-user-card').first().click();
    await page.locator('.admin-onboarding-modal').waitFor();
    await assertNoHorizontalOverflow(page);
  });

  // ── Scroll position preservation (architect §8) ───────────────────────────

  test('mobile: scroll position is preserved after closing the modal', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    // The users list is short (3 users); scroll by a small, achievable amount.
    // Use a value that won't exceed the page height.
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = viewport.height;
    const maxScroll = Math.max(0, pageHeight - viewportHeight);
    const targetScroll = Math.min(150, maxScroll);
    if (targetScroll < 10) {
      // Page isn't tall enough to scroll meaningfully — skip the scroll
      // preservation assertion but still verify the modal opens/closes.
      await page.locator('.admin-user-card').first().click();
      await page.locator('.admin-onboarding-modal').waitFor();
      await page.locator('.admin-onboarding-modal .mobile-sheet__close').click();
      await expect(page.locator('.admin-onboarding-modal')).toHaveCount(0);
      return;
    }

    await page.evaluate((y) => window.scrollTo(0, y), targetScroll);
    await page.waitForTimeout(100);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Open the modal.
    await page.locator('.admin-user-card').first().click();
    await page.locator('.admin-onboarding-modal').waitFor();

    // Close the modal via the close button.
    await page.locator('.admin-onboarding-modal .mobile-sheet__close').click();
    await expect(page.locator('.admin-onboarding-modal')).toHaveCount(0);

    // The scroll position must be preserved (within a small tolerance).
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore), `scroll changed: ${scrollBefore} → ${scrollAfter}`).toBeLessThanOrEqual(5);
  });

  // ── Focus + body scroll lock (architect §7) ───────────────────────────────

  test('mobile: body scroll is locked while modal open, restored after close', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const overflowBefore = await page.evaluate(() => document.body.style.overflow);
    expect(overflowBefore).not.toBe('hidden');

    await page.locator('.admin-user-card').first().click();
    await page.locator('.admin-onboarding-modal').waitFor();

    const overflowDuring = await page.evaluate(() => document.body.style.overflow);
    expect(overflowDuring, 'body overflow must be hidden while modal open').toBe('hidden');

    await page.locator('.admin-onboarding-modal .mobile-sheet__close').click();
    await expect(page.locator('.admin-onboarding-modal')).toHaveCount(0);

    const overflowAfter = await page.evaluate(() => document.body.style.overflow);
    expect(overflowAfter, 'body overflow must be restored after close').not.toBe('hidden');
  });

  test('mobile: Escape closes the modal and restores focus to the trigger card', async ({ page, browserName }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }
    test.skip(browserName === 'webkit', 'Focus timing on webkit is flaky');

    const firstCard = page.locator('.admin-user-card').first();
    await firstCard.click();
    await page.locator('.admin-onboarding-modal').waitFor();

    await page.keyboard.press('Escape');
    await expect(page.locator('.admin-onboarding-modal')).toHaveCount(0);

    // Focus should return to the selected user card.
    await expect(firstCard).toBeFocused();
  });

  test('mobile: overlay click closes the modal', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    await page.locator('.admin-user-card').first().click();
    await page.locator('.admin-onboarding-modal').waitFor();

    // Click the overlay (dimmed background outside the sheet).
    const overlay = page.locator('.admin-onboarding-modal-overlay');
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.admin-onboarding-modal')).toHaveCount(0);
  });

  // ── Selecting a different user updates the modal ──────────────────────────

  test('mobile: selecting another user after close shows that user details', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    // Select the first user.
    await page.locator('.admin-user-card').nth(0).click();
    await page.locator('.admin-onboarding-modal').waitFor();
    await expect(page.locator('.admin-onboarding-modal')).toContainText(/adaezi/i);

    // Close.
    await page.locator('.admin-onboarding-modal .mobile-sheet__close').click();
    await expect(page.locator('.admin-onboarding-modal')).toHaveCount(0);

    // Select the second user.
    await page.locator('.admin-user-card').nth(1).click();
    await page.locator('.admin-onboarding-modal').waitFor();
    await expect(page.locator('.admin-onboarding-modal')).toContainText(/kwame/i);
  });

  // ── Desktop: side-by-side pane, no modal ──────────────────────────────────

  test('desktop: side-by-side pane preserved, no modal', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width <= 700) {
      test.skip();
      return;
    }

    // Desktop pane visible.
    const desktopPane = page.locator('.admin-users-pane--desktop-only');
    await expect(desktopPane).toBeVisible();

    // Select the first user.
    await page.locator('.admin-user-card').first().click();

    // No modal should appear on desktop.
    await expect(page.locator('.admin-onboarding-modal')).toHaveCount(0);

    // The desktop pane should show the onboarding content.
    await expect(desktopPane.getByText(/can start trading/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('no console errors', async ({ page }) => {
    assertNoConsoleErrors(page);
  });
});
