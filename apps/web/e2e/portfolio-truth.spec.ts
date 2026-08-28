import { test, expect } from '@playwright/test';
import {
  setupErrorCollectors,
  assertNoHorizontalOverflow,
  assertNoConsoleErrors,
  assertNoFailedRequests,
  assertNoExternalRequests,
  mockAuthUser,
  mockAuthTokens,
} from './fixtures';

const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

const freshAccount = {
  connectionId: CONNECTION_ID,
  brokerName: 'Paper Broker',
  displayName: 'Primary demo',
  accountType: 'DEMO',
  connectionStatus: 'CONNECTED',
  liveTradingEnabled: false,
  snapshot: {
    currency: 'USD',
    balance: '10000.00000000',
    equity: '10125.50000000',
    freshness: 'FRESH',
    syncedAt: '2026-08-28T21:04:31.000Z',
    ageSeconds: 29,
  },
  snapshotUnavailableReason: null,
};

async function gotoPortfolioWithResponse(
  page: Parameters<typeof setupErrorCollectors>[0],
  portfolioResponse: unknown,
) {
  setupErrorCollectors(page);

  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname.split('/api/v1/')[1] ?? '';
    const fulfill = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (apiPath === 'auth/refresh') return fulfill(200, mockAuthTokens);
    if (apiPath === 'auth/me') return fulfill(200, mockAuthUser);
    if (apiPath === 'auth/logout') return fulfill(200, { message: 'Logged out' });
    if (apiPath === 'portfolio/accounts') return fulfill(200, portfolioResponse);

    return fulfill(200, {});
  });

  await page.goto('/trade/portfolio');
  await expect(page.getByRole('heading', { level: 1, name: 'Account Portfolio' })).toBeVisible();
}

test.describe('Portfolio Truth', () => {
  test('renders only currency-bearing authoritative balance and equity', async ({ page }) => {
    await gotoPortfolioWithResponse(page, [freshAccount]);

    const accountCard = page
      .getByRole('heading', { level: 2, name: 'Primary demo' })
      .locator('..');

    await expect(accountCard.getByText('Paper Broker', { exact: true })).toBeVisible();
    await expect(accountCard.getByText('USD 10000.00000000', { exact: true })).toBeVisible();
    await expect(accountCard.getByText('USD 10125.50000000', { exact: true })).toBeVisible();
    await expect(accountCard.getByText('Fresh snapshot', { exact: true })).toBeVisible();
    await expect(accountCard.getByText('29 seconds', { exact: true })).toBeVisible();

    await expect(page.getByText(/No monetary values are reconstructed from browser state/i)).toBeVisible();
    await expect(page.getByText(/P&L remain hidden/i)).toBeVisible();
    await expect(page.getByText(/does not place trades, calculate profit/i)).toBeVisible();

    await expect(page.getByText('margin', { exact: true })).toHaveCount(0);
    await expect(page.getByText('freeMargin', { exact: false })).toHaveCount(0);
    await expect(page.getByText('realisedPnl', { exact: false })).toHaveCount(0);
    await expect(page.getByText('unrealisedPnl', { exact: false })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  test('shows stale and unavailable states without inventing current money', async ({ page }) => {
    await gotoPortfolioWithResponse(page, [
      {
        ...freshAccount,
        connectionStatus: 'DISCONNECTED',
        snapshot: {
          ...freshAccount.snapshot,
          freshness: 'STALE',
          ageSeconds: 240,
        },
      },
      {
        ...freshAccount,
        connectionId: '33333333-3333-4333-8333-333333333333',
        displayName: 'Awaiting verification',
        snapshot: null,
        snapshotUnavailableReason: 'UNVERIFIED_ZERO_PLACEHOLDER',
      },
    ]);

    await expect(page.getByText('Stale snapshot', { exact: true })).toBeVisible();
    await expect(page.getByText(/last verified broker snapshot/i)).toBeVisible();
    await expect(page.getByText(/stored zero values have not yet been verified/i)).toBeVisible();

    const awaitingCard = page
      .getByRole('heading', { level: 2, name: 'Awaiting verification' })
      .locator('..');
    await expect(awaitingCard.getByText('USD 10000.00000000', { exact: true })).toHaveCount(0);
    await expect(awaitingCard.getByText('USD 10125.50000000', { exact: true })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  test('fails closed when the API broadens the contract with internal account data', async ({ page }) => {
    await gotoPortfolioWithResponse(page, [
      {
        ...freshAccount,
        accountId: 'provider-secret-ish-account-reference',
      },
    ]);

    await expect(
      page.getByText(/Unable to load the authoritative portfolio snapshot/i),
    ).toBeVisible();
    await expect(page.getByText('USD 10000.00000000', { exact: true })).toHaveCount(0);
    await expect(page.getByText('provider-secret-ish-account-reference', { exact: false })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });
});
