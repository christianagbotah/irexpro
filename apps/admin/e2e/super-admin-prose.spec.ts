import { test, expect } from '@playwright/test';
import { setupNonAdminAuthInterception } from './fixtures';

test.describe('Admin role presentation regression', () => {
  test('AuthLayout never exposes raw ADMIN/SUPER_ADMIN enum prose', async ({ page }) => {
    await setupNonAdminAuthInterception(page);
    await page.goto('/admin/login');

    const subheadline = page.locator('.auth-layout__subheadline');
    await expect(subheadline).toBeVisible();
    await expect(subheadline).toContainText('Admin or Super Admin');

    const text = (await subheadline.textContent()) ?? '';
    expect(text).not.toContain('SUPER_ADMIN');
    expect(text).not.toContain('ADMIN or');
  });
});
