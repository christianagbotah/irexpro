import { test, expect } from '@playwright/test';
import {
  assertNoConsoleErrors,
  assertNoExternalRequests,
  assertNoFailedRequests,
  assertNoHorizontalOverflow,
  mockAuthTokens,
  mockAuthUser,
  setupErrorCollectors,
} from './fixtures';

const freshSnapshot = {
  instrument: 'EURUSD',
  timeframe: 'H1',
  source: 'BROKER',
  status: 'FRESH',
  retrievedAt: '2026-08-30T20:00:30.000Z',
  latestCandleAt: '2026-08-30T20:00:00.000Z',
  quote: {
    bid: '1.17001',
    ask: '1.17013',
    spread: '0.00012',
    timestamp: '2026-08-30T20:00:15.000Z',
    freshness: 'FRESH',
  },
  candles: [
    { timestamp: '2026-08-30T17:00:00.000Z', open: '1.16890', high: '1.16960', low: '1.16870', close: '1.16940', volume: '910' },
    { timestamp: '2026-08-30T18:00:00.000Z', open: '1.16940', high: '1.17000', low: '1.16910', close: '1.16980', volume: '1040' },
    { timestamp: '2026-08-30T19:00:00.000Z', open: '1.16980', high: '1.17020', low: '1.16950', close: '1.16965', volume: '980' },
    { timestamp: '2026-08-30T20:00:00.000Z', open: '1.16965', high: '1.17030', low: '1.16955', close: '1.17005', volume: '1200' },
  ],
};

async function gotoMarket(page: Parameters<typeof setupErrorCollectors>[0], body: unknown) {
  setupErrorCollectors(page);
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname.split('/api/v1/')[1] ?? '';
    const fulfill = (status: number, responseBody: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(responseBody) });

    if (apiPath === 'auth/refresh') return fulfill(200, mockAuthTokens);
    if (apiPath === 'auth/me') return fulfill(200, mockAuthUser);
    if (apiPath === 'auth/logout') return fulfill(200, { message: 'Logged out' });
    if (apiPath === 'market-data/intelligence') return fulfill(200, body);
    return fulfill(200, {});
  });

  await page.goto('/market');
  await expect(page.getByRole('heading', { level: 1, name: 'Market Intelligence' })).toBeVisible();
}

test.describe('Market Intelligence', () => {
  test('renders broker-authoritative quote, provenance, and candlesticks', async ({ page }) => {
    await gotoMarket(page, freshSnapshot);

    await expect(page.getByText('1.17001', { exact: true })).toBeVisible();
    await expect(page.getByText('1.17013', { exact: true })).toBeVisible();
    await expect(page.getByText('0.00012', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /candlestick chart with 4 broker candles/i })).toBeVisible();
    await expect(page.getByText(/connected broker adapter/i)).toBeVisible();

    await expect(page.getByText('brokerConnectionId', { exact: false })).toHaveCount(0);
    await expect(page.getByText('providerAccountId', { exact: false })).toHaveCount(0);
    await expect(page.getByText('placeOrder', { exact: false })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  test('shows stale evidence explicitly instead of presenting it as live', async ({ page }) => {
    await gotoMarket(page, {
      ...freshSnapshot,
      status: 'STALE',
      quote: { ...freshSnapshot.quote, freshness: 'STALE' },
    });

    await expect(page.getByText(/broker returned stale market evidence/i)).toBeVisible();
    await expect(page.getByText('STALE', { exact: true }).first()).toBeVisible();
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  test('fails closed if the browser contract unexpectedly broadens', async ({ page }) => {
    await gotoMarket(page, { ...freshSnapshot, brokerConnectionId: 'internal-id-must-not-render' });

    await expect(page.getByText(/failed verification/i)).toBeVisible();
    await expect(page.getByText('1.17001', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: /candlestick chart/i })).toHaveCount(0);
    assertNoConsoleErrors(page);
    assertNoExternalRequests(page);
  });

  test('supports instrument and timeframe refresh without preserving old data on failure', async ({ page }) => {
    let marketRequests = 0;
    setupErrorCollectors(page);
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const apiPath = url.pathname.split('/api/v1/')[1] ?? '';
      const fulfill = (status: number, responseBody: unknown) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(responseBody) });
      if (apiPath === 'auth/refresh') return fulfill(200, mockAuthTokens);
      if (apiPath === 'auth/me') return fulfill(200, mockAuthUser);
      if (apiPath === 'auth/logout') return fulfill(200, { message: 'Logged out' });
      if (apiPath === 'market-data/intelligence') {
        marketRequests += 1;
        if (marketRequests === 1) return fulfill(200, freshSnapshot);
        return fulfill(503, { statusCode: 503, message: 'Unavailable' });
      }
      return fulfill(200, {});
    });

    await page.goto('/market');
    await expect(page.getByText('1.17001', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'M15' }).click();
    await expect(page.getByText(/previously loaded quote and chart data have been cleared/i)).toBeVisible();
    await expect(page.getByText('1.17001', { exact: true })).toHaveCount(0);
    assertNoConsoleErrors(page);
    assertNoExternalRequests(page);
  });

  test('has no horizontal overflow across nine target viewports', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568 },
      { width: 360, height: 800 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
    ];

    await gotoMarket(page, freshSnapshot);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { level: 1, name: 'Market Intelligence' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }

    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });
});
