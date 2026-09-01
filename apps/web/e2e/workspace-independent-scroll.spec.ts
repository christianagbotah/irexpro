import { test, expect } from '@playwright/test';
import { gotoAsAuthenticated } from './fixtures';

test.describe('Trader workspace independent scrolling', () => {
  test('sidebar and main content scroll independently on desktop/tablet', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width <= 700) {
      test.skip();
      return;
    }

    await gotoAsAuthenticated(page, '/dashboard', { heading: /welcome back/i });

    const shell = page.locator('.dashboard-shell.terminal-shell');
    const sidebar = page.locator('.dashboard-sidebar.terminal-sidebar');
    const content = page.locator('.dashboard-content.terminal-content');

    await expect(shell).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(content).toBeVisible();

    const contract = await page.evaluate(() => {
      const shellEl = document.querySelector<HTMLElement>('.dashboard-shell.terminal-shell');
      const sidebarEl = document.querySelector<HTMLElement>('.dashboard-sidebar.terminal-sidebar');
      const contentEl = document.querySelector<HTMLElement>('.dashboard-content.terminal-content');
      if (!shellEl || !sidebarEl || !contentEl) throw new Error('Workspace shell elements missing');

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
      sidebarY: document.querySelector<HTMLElement>('.dashboard-sidebar.terminal-sidebar')?.scrollTop ?? -1,
      contentY: document.querySelector<HTMLElement>('.dashboard-content.terminal-content')?.scrollTop ?? -1,
    }));

    expect(afterMainScroll.windowY).toBe(0);
    expect(afterMainScroll.sidebarY).toBe(0);
    expect(afterMainScroll.contentY).toBeGreaterThan(0);

    const mainScrollBeforeSidebarMove = afterMainScroll.contentY;

    await sidebar.evaluate((el) => {
      const spacer = document.createElement('div');
      spacer.setAttribute('data-scroll-test', 'sidebar');
      spacer.style.flex = '0 0 1400px';
      spacer.style.height = '1400px';
      spacer.style.pointerEvents = 'none';
      el.appendChild(spacer);
      el.scrollTop = 360;
    });

    await expect.poll(() => sidebar.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    const afterSidebarScroll = await page.evaluate(() => ({
      windowY: window.scrollY,
      sidebarY: document.querySelector<HTMLElement>('.dashboard-sidebar.terminal-sidebar')?.scrollTop ?? -1,
      contentY: document.querySelector<HTMLElement>('.dashboard-content.terminal-content')?.scrollTop ?? -1,
    }));

    expect(afterSidebarScroll.windowY).toBe(0);
    expect(afterSidebarScroll.sidebarY).toBeGreaterThan(0);
    expect(afterSidebarScroll.contentY).toBe(mainScrollBeforeSidebarMove);
  });
});
