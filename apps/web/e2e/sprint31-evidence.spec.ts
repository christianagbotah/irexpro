import { test } from '@playwright/test';
import { gotoAsAuthenticated } from './fixtures';

/**
 * Sprint 31 remediation — screenshot evidence (architect §14).
 *
 * Captures non-secret responsive screenshots of the key Web pages at the
 * required viewports. Screenshots are written to test-results/evidence/
 * <width>x<height>/<state>.png (gitignored — not committed). Uses the same
 * route-interception auth strategy as the other e2e specs (no real backend,
 * no secrets, no test passwords).
 *
 * Gated by E2E_CAPTURE_EVIDENCE=1 so normal CI runs incur no overhead.
 *
 * Minimum required set (architect §14):
 *   - dashboard @ 390
 *   - dashboard @ 1440
 *   - mobile navigation @ 390
 *   - More Sheet open @ 390
 *   - onboarding @ 390
 */
const CAPTURE = process.env.E2E_CAPTURE_EVIDENCE === '1';

function evidencePath(width: number, height: number, state: string) {
  return `test-results/evidence/${width}x${height}/${state}.png`;
}

test.describe('Sprint 31 evidence screenshots', () => {
  test.skip(!CAPTURE, 'Set E2E_CAPTURE_EVIDENCE=1 to capture evidence');

  test('dashboard @ 390', async ({ page }) => {
    await gotoAsAuthenticated(page, '/dashboard', { heading: /welcome back/i });
    const v = page.viewportSize()!;
    await page.screenshot({ path: evidencePath(v.width, v.height, 'dashboard'), fullPage: false });
  });

  test('mobile navigation @ 390', async ({ page }) => {
    await gotoAsAuthenticated(page, '/dashboard', { heading: /welcome back/i });
    const v = page.viewportSize()!;
    // Scroll to show the bottom nav clearly.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({ path: evidencePath(v.width, v.height, 'mobile-navigation'), fullPage: false });
  });

  test('More Sheet open @ 390', async ({ page }) => {
    const v = page.viewportSize();
    if (!v || v.width > 700) {
      test.skip();
      return;
    }
    await gotoAsAuthenticated(page, '/dashboard', { heading: /welcome back/i });
    await page.locator('.mobile-bottom-nav__item[aria-label="More navigation"]').click();
    await page.locator('#mobile-more-sheet').waitFor();
    await page.screenshot({ path: evidencePath(v.width, v.height, 'more-sheet-open'), fullPage: false });
  });

  test('onboarding profile @ 390', async ({ page }) => {
    const v = page.viewportSize();
    if (!v || v.width > 700) {
      // Onboarding screenshot at mobile only; desktop is covered by the
      // dashboard screenshot.
      test.skip();
      return;
    }
    await gotoAsAuthenticated(page, '/onboarding/profile', { heading: /profile/i });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'onboarding-profile'), fullPage: false });
  });
});
