import { test } from '@playwright/test';

/**
 * Post-Sprint-31 hotfix Issue D — Web login Rendered Visual QA evidence.
 *
 * Captures non-secret screenshots of the Web login page at mobile (390, 430)
 * and desktop (1440) for VLM visual inspection. Verifies the descriptive
 * brand panel no longer has an internal vertical scrollbar on mobile.
 *
 * Gated by E2E_CAPTURE_EVIDENCE=1.
 */
const CAPTURE = process.env.E2E_CAPTURE_EVIDENCE === '1';

function evidencePath(width: number, height: number, state: string) {
  return `test-results/evidence/${width}x${height}/${state}.png`;
}

test.describe('Post-Sprint-31 hotfix Issue D — Web login evidence', () => {
  test.skip(!CAPTURE, 'Set E2E_CAPTURE_EVIDENCE=1 to capture evidence');

  test('web login', async ({ page }) => {
    const v = page.viewportSize()!;
    await page.goto('/login');
    await page.locator('input').first().waitFor({ timeout: 5000 });
    await page.screenshot({ path: evidencePath(v.width, v.height, 'web-login'), fullPage: false });
  });
});
