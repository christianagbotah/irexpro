import { test, expect } from '@playwright/test';
import { gotoAsAdmin } from './fixtures';

test.describe('Admin workspace independent scrolling', () => {
  test('sidebar and main content scroll independently on desktop/tablet', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width <= 700) {
      test.skip();
      return;
    }

    await gotoAsAdmin(page, '/admin/brokers', { heading: /^brokers$/i });

    const shell = page.locator('.admin-shell').first();
    const sidebar = page.locator('.admin-shell > .sidebar');
    const content = page.locator('.admin-shell > .content');

    await expect(shell).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(content).toBeVisible();

    const contract = await page.evaluate(() => {
      const shellEl = document.querySelector<HTMLElement>('.admin-shell');
      const sidebarEl = document.querySelector<HTMLElement>('.admin-shell > .sidebar');
      const contentEl = document.querySelector<HTMLElement>('.admin-shell > .content');
      if (!shellEl || !sidebarEl || !contentEl) throw new Error('Admin shell elements missing');

      return {
        viewportHeight: window.innerHeight,
        shellHeight: shellEl.getBoundingClientRect().height,
        shellOverflowY: getComputedStyle(shellEl).overflowY,
        sidebarOverflowY: getComputedStyle(sidebarEl).overflowY,
        contentOverflowY: getComputedStyle(contentEl).overflowY,
      };
    });

    expect(contract.shellOverflowY).toBe('hidden');
    expect(contract.sidebarOverflowY).toBe('auto');
    expect(contract.contentOverflowY).toBe('auto');
    expect(Math.abs(contract.shellHeight - contract.viewportHeight)).toBeLessThanOrEqual(1);

    await page.evaluate(() => window.scrollTo(0, 0));

    await content.evaluate((el) => {
      const spacer = document.createElement('div');
      spacer.setAttribute('data-scroll-test', 'main');
      spacer.style.height = '1800px';
      spacer.style.pointerEvents = 'none';
      el.appendChild(spacer);
      el.scrollTop = 420;
    });

    await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    const afterMainScroll = await page.evaluate(() => ({
      windowY: window.scrollY,
      sidebarY: document.querySelector<HTMLElement>('.admin-shell > .sidebar')?.scrollTop ?? -1,
      contentY: document.querySelector<HTMLElement>('.admin-shell > .content')?.scrollTop ?? -1,
    }));

    expect(afterMainScroll.windowY).toBe(0);
    expect(afterMainScroll.sidebarY).toBe(0);
    expect(afterMainScroll.contentY).toBeGreaterThan(0);

    const mainScrollBeforeSidebarMove = afterMainScroll.contentY;

    await sidebar.evaluate((el) => {
      const spacer = document.createElement('div');
      spacer.setAttribute('data-scroll-test', 'sidebar');
      spacer.style.height = '1400px';
      spacer.style.pointerEvents = 'none';
      el.appendChild(spacer);
      el.scrollTop = 360;
    });

    await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    const afterSidebarScroll = await page.evaluate(() => ({
      windowY: window.scrollY,
      sidebarY: document.querySelector<HTMLElement>('.admin-shell > .sidebar')?.scrollTop ?? -1,
      contentY: document.querySelector<HTMLElement>('.admin-shell > .content')?.scrollTop ?? -1,
    }));

    expect(afterSidebarScroll.windowY).toBe(0);
    expect(afterSidebarScroll.sidebarY).toBeGreaterThan(0);
    expect(afterSidebarScroll.contentY).toBe(mainScrollBeforeSidebarMove);
  });
});
