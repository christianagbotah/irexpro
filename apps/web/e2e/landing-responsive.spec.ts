import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow } from './fixtures';

test.describe('Landing page responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('has no horizontal overflow', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  test('shows the branded header', async ({ page }) => {
    await expect(page.locator('.landing-header')).toBeVisible();
    await expect(page.locator('.landing-header__wordmark')).toHaveText('iRexPro');
  });

  test('shows the hero and signed-out CTAs', async ({ page }) => {
    await expect(page.locator('.landing-hero')).toBeVisible();
    await expect(page.locator('.landing-hero__title')).toBeVisible();
    await expect(page.locator('.landing-hero__subtitle')).toBeVisible();
    await expect(page.getByRole('link', { name: /create account/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /log in/i }).first()).toBeVisible();
  });

  test('shows four feature cards', async ({ page }) => {
    const features = page.locator('.landing-feature');
    await expect(features).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      await expect(features.nth(i)).toBeVisible();
    }
  });

  test('shows CTA and footer', async ({ page }) => {
    await expect(page.locator('.landing-cta')).toBeVisible();
    await expect(page.locator('.landing-footer')).toBeVisible();
  });

  test('keeps content inside viewport gutters', async ({ page }) => {
    const heroInner = page.locator('.landing-hero__inner');
    const box = await heroInner.boundingBox();
    expect(box, 'hero inner must have bounding box').not.toBeNull();
    if (!box) return;
    expect(box.x).toBeGreaterThan(0);
    const viewport = page.viewportSize();
    if (viewport) {
      expect(box.x + box.width).toBeLessThan(viewport.width);
    }
  });

  test('uses valid signed-out navigation routes', async ({ page }) => {
    const nav = page.locator('.landing-header__nav');
    await expect(nav.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
    await expect(nav.getByRole('link', { name: /create account/i })).toHaveAttribute('href', '/register');
    await expect(nav.getByRole('link', { name: /^dashboard$/i })).toHaveCount(0);
  });

  test('hero CTA routes to register and login', async ({ page }) => {
    const hero = page.locator('.landing-hero__cta');
    await expect(hero.getByRole('link', { name: /create account/i })).toHaveAttribute('href', '/register');
    await expect(hero.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
  });
});
