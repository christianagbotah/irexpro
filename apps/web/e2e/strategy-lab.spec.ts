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

const safeSnapshot = {
  dataset: {
    id: 'strategy-lab-core',
    version: '1.0.0',
    asOf: '2026-08-29T00:00:00.000Z',
    checksumSha256: 'sha256:21540b6e21ccc999fc65edbbbe5891b762c5bf08b7abb34a58da7cd2ab72c02b',
    methodologyVersion: 'scorecard.v1',
  },
  methodology: {
    objective: 'Rank deterministic fixtures.',
    weights: { expectedReturn: 0.25, profitFactor: 0.25, drawdownProtection: 0.25, stability: 0.15, winRate: 0.1 },
    constraints: { maxDrawdownPct: 12, minProfitFactor: 1.1, maxExposurePct: 35 },
  },
  scenarios: [
    {
      id: 'trend-expansion',
      name: 'Trend expansion',
      marketRegime: 'TRENDING',
      volatility: 'MODERATE',
      description: 'Directional market with sustained momentum.',
      recommendation: { strategyCode: 'TREND_H1', summary: 'Adaptive Trend H1 ranks first.' },
      candidates: [
        {
          rank: 1,
          strategyCode: 'TREND_H1',
          name: 'Adaptive Trend H1',
          timeframe: 'H1',
          eligible: true,
          score: 72.5,
          metrics: { expectedReturnPct: 12.8, maxDrawdownPct: 7.4, winRate: 0.57, profitFactor: 1.62, stability: 0.84, exposurePct: 28 },
          scorecard: { expectedReturn: 85.3, profitFactor: 68.3, drawdownProtection: 63, stability: 84, winRate: 57 },
          constraints: [
            { code: 'MAX_DRAWDOWN', label: 'Maximum drawdown', passed: true, actual: 7.4, limit: 12 },
            { code: 'MIN_PROFIT_FACTOR', label: 'Minimum profit factor', passed: true, actual: 1.62, limit: 1.1 },
            { code: 'MAX_EXPOSURE', label: 'Maximum exposure', passed: true, actual: 28, limit: 35 },
          ],
          rationale: ['Composite score 72.5/100 using fixed scorecard.v1 weights.'],
          tradeoffs: ['Lower modeled drawdown improves capital preservation in this scenario.'],
        },
      ],
    },
    {
      id: 'range-compression',
      name: 'Range compression',
      marketRegime: 'RANGING',
      volatility: 'LOW',
      description: 'Compressed price action with repeated mean reversion.',
      recommendation: { strategyCode: 'MEAN_REVERT_M15', summary: 'Mean Reversion M15 ranks first.' },
      candidates: [
        {
          rank: 1,
          strategyCode: 'MEAN_REVERT_M15',
          name: 'Mean Reversion M15',
          timeframe: 'M15',
          eligible: true,
          score: 71,
          metrics: { expectedReturnPct: 10.7, maxDrawdownPct: 6.3, winRate: 0.66, profitFactor: 1.58, stability: 0.88, exposurePct: 29 },
          scorecard: { expectedReturn: 71.3, profitFactor: 65, drawdownProtection: 68.5, stability: 88, winRate: 66 },
          constraints: [
            { code: 'MAX_DRAWDOWN', label: 'Maximum drawdown', passed: true, actual: 6.3, limit: 12 },
            { code: 'MIN_PROFIT_FACTOR', label: 'Minimum profit factor', passed: true, actual: 1.58, limit: 1.1 },
            { code: 'MAX_EXPOSURE', label: 'Maximum exposure', passed: true, actual: 29, limit: 35 },
          ],
          rationale: ['Composite score 71/100 using fixed scorecard.v1 weights.'],
          tradeoffs: ['Higher win rate does not by itself guarantee the strongest risk-adjusted score.'],
        },
      ],
    },
  ],
  disclaimer: 'Strategy Lab is advisory only.',
};

async function gotoStrategyLab(page: Parameters<typeof setupErrorCollectors>[0], body: unknown) {
  setupErrorCollectors(page);
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname.split('/api/v1/')[1] ?? '';
    const fulfill = (status: number, responseBody: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(responseBody) });

    if (apiPath === 'auth/refresh') return fulfill(200, mockAuthTokens);
    if (apiPath === 'auth/me') return fulfill(200, mockAuthUser);
    if (apiPath === 'auth/logout') return fulfill(200, { message: 'Logged out' });
    if (apiPath === 'strategy/lab') return fulfill(200, body);
    return fulfill(200, {});
  });

  await page.goto('/strategy-lab');
  await expect(page.getByRole('heading', { level: 1, name: 'Strategy Lab' })).toBeVisible();
}

test.describe('Strategy Lab', () => {
  test('renders verified rankings and switches deterministic scenarios', async ({ page }) => {
    await gotoStrategyLab(page, safeSnapshot);

    await expect(page.getByText('sha256:21540b6e21ccc999fc65edbbbe5891b762c5bf08b7abb34a58da7cd2ab72c02b')).toBeVisible();
    await expect(page.getByText('#1 · Adaptive Trend H1')).toBeVisible();
    await expect(page.getByText('72.5', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Range compression · Low' }).click();
    await expect(page.getByText('#1 · Mean Reversion M15')).toBeVisible();
    await expect(page.getByText(/recommended for this fixture: mean_revert_m15/i)).toBeVisible();

    await expect(page.getByText('brokerConnectionId', { exact: false })).toHaveCount(0);
    await expect(page.getByText('idempotencyKey', { exact: false })).toHaveCount(0);
    await expect(page.getByText('executeTrade', { exact: false })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  test('fails closed when the browser contract broadens unexpectedly', async ({ page }) => {
    await gotoStrategyLab(page, { ...safeSnapshot, brokerMutation: true });

    await expect(page.getByText(/unable to load the verified strategy lab dataset/i)).toBeVisible();
    await expect(page.getByText('#1 · Adaptive Trend H1')).toHaveCount(0);
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

    await gotoStrategyLab(page, safeSnapshot);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { level: 1, name: 'Strategy Lab' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }

    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });
});
