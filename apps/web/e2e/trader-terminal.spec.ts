import { test, expect } from '@playwright/test';
import {
  gotoAsAuthenticated,
  assertNoHorizontalOverflow,
  assertNoConsoleErrors,
} from './fixtures';

const WORKSPACES = [
  { path: '/trade', heading: 'Trading Workspace', navLabel: 'Trading Workspace' },
  { path: '/ai', heading: 'AI Command Center', navLabel: 'AI Command Center' },
  { path: '/portfolio', heading: 'Portfolio & Risk', navLabel: 'Portfolio & Risk' },
] as const;

test.describe('Sprint 33 trader terminal foundation', () => {
  for (const workspace of WORKSPACES) {
    test(`${workspace.heading} renders the authenticated authoritative-data foundation`, async ({ page }) => {
      await gotoAsAuthenticated(page, workspace.path, { heading: new RegExp(workspace.heading, 'i') });

      await expect(page.getByRole('heading', { level: 1, name: workspace.heading })).toBeVisible();
      await expect(page.getByText(/will not display fabricated trading metrics/i)).toBeVisible();
      await expect(page.getByText(/data integrity policy/i)).toBeVisible();
      await expect(page.locator('.terminal-foundation__capability')).toHaveCount(4);

      await assertNoHorizontalOverflow(page);
      assertNoConsoleErrors(page);
    });
  }

  test('desktop workspace navigation exposes the four primary product areas', async ({ page }) => {
    await gotoAsAuthenticated(page, '/trade', { heading: /Trading Workspace/i });
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (!viewport || viewport.width <= 700) {
      test.skip();
      return;
    }

    const nav = page.getByRole('navigation', { name: /primary workspace navigation/i });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Trading Workspace' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'AI Command Center' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Portfolio & Risk' })).toBeVisible();
  });

  test('mobile More sheet exposes Trade, AI, and Portfolio without expanding the three-item bottom bar', async ({ page }) => {
    await gotoAsAuthenticated(page, '/trade', { heading: /Trading Workspace/i });
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (!viewport || viewport.width > 700) {
      test.skip();
      return;
    }

    const bottomItems = page.locator('.mobile-bottom-nav__item');
    await expect(bottomItems).toHaveCount(3);

    await page.getByRole('button', { name: /more navigation/i }).click();
    const sheet = page.locator('#mobile-more-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Trading Workspace' })).toHaveAttribute('aria-current', 'page');
    await expect(sheet.getByRole('link', { name: 'AI Command Center' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Portfolio & Risk' })).toBeVisible();
  });
});
