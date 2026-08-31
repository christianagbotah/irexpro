import { expect, test } from '@playwright/test';
import {
  assertNoConsoleErrors,
  assertNoExternalRequests,
  assertNoFailedRequests,
  assertNoHorizontalOverflow,
  mockAuthTokens,
  mockAuthUser,
  mockBrokerConnections,
  setupErrorCollectors,
} from './fixtures';

const marketSnapshot = {
  instrument: 'EURUSD',
  timeframe: 'H1',
  source: 'BROKER',
  status: 'FRESH',
  retrievedAt: '2026-08-31T01:00:30.000Z',
  latestCandleAt: '2026-08-31T01:00:00.000Z',
  quote: {
    bid: '1.17001',
    ask: '1.17013',
    spread: '0.00012',
    timestamp: '2026-08-31T01:00:15.000Z',
    freshness: 'FRESH',
  },
  candles: [
    {
      timestamp: '2026-08-30T22:00:00.000Z',
      open: '1.16890',
      high: '1.16960',
      low: '1.16870',
      close: '1.16940',
      volume: '910',
    },
    {
      timestamp: '2026-08-30T23:00:00.000Z',
      open: '1.16940',
      high: '1.17000',
      low: '1.16910',
      close: '1.16980',
      volume: '1040',
    },
    {
      timestamp: '2026-08-31T00:00:00.000Z',
      open: '1.16980',
      high: '1.17020',
      low: '1.16950',
      close: '1.16965',
      volume: '980',
    },
    {
      timestamp: '2026-08-31T01:00:00.000Z',
      open: '1.16965',
      high: '1.17030',
      low: '1.16955',
      close: '1.17005',
      volume: '1200',
    },
  ],
};

const riskSnapshot = {
  engine: { killSwitchActive: false, brokerConnected: true },
  policy: {
    riskAcknowledgementAccepted: true,
    allowedTradingMode: 'FULL_AUTO',
    limits: {
      maxDailyLossPercent: '5.00',
      maxDrawdownPercent: '10.00',
      maxOpenTrades: 3,
      maxDailyTrades: 10,
      maxPositionSizeLot: '0.1000',
      minStopLossPips: '5.00',
      maxVolatilityScore: '0.85',
      maxTradeRiskPercent: '2.00',
      maxLeverageAllowed: 30,
      allowedInstruments: ['EURUSD', 'GBPUSD'],
      rejectLowLiquidity: true,
    },
  },
  execution: {
    openPositions: 1,
    maxOpenPositions: 3,
    openPositionSlotsRemaining: 2,
    todayTrades: 4,
    maxDailyTrades: 10,
    dailyTradeSlotsRemaining: 6,
  },
  portfolio: {
    totalAccounts: 1,
    connectedAccounts: 1,
    freshSnapshots: 1,
    staleSnapshots: 0,
    unavailableSnapshots: 0,
  },
  recentViolations: [],
};

const decisionSnapshot = {
  generatedAt: '2026-08-31T01:02:00.000Z',
  decisions: [
    {
      signalId: '11111111-1111-4111-8111-111111111111',
      outcome: 'EXECUTION_SUCCEEDED',
      receivedAt: '2026-08-31T01:01:00.000Z',
      evidence: {
        instrument: 'EURUSD',
        direction: 'BUY',
        confidenceScore: 0.82,
        strategyCode: 'TREND_H1',
        modelVersion: 'ensemble-v2.3',
        timeframe: 'H1',
        marketRegime: 'trending',
        volatilityScore: 0.42,
        generatedAt: '2026-08-31T01:00:58.000Z',
      },
      risk: { decision: 'APPROVED', rejectionCode: null, rejectionReason: null },
      execution: {
        tradeId: '22222222-2222-4222-8222-222222222222',
        status: 'OPEN',
        openedAt: '2026-08-31T01:01:02.000Z',
        closedAt: null,
        closeReason: null,
      },
      timeline: [
        {
          stage: 'SIGNAL',
          status: 'RECEIVED',
          code: null,
          message: 'AI signal received',
          at: '2026-08-31T01:01:00.000Z',
        },
        {
          stage: 'RISK',
          status: 'APPROVED',
          code: null,
          message: 'Risk engine approved the signal',
          at: '2026-08-31T01:01:01.000Z',
        },
        {
          stage: 'EXECUTION',
          status: 'SUCCEEDED',
          code: null,
          message: 'Execution engine accepted the approved signal',
          at: '2026-08-31T01:01:02.000Z',
        },
      ],
    },
  ],
};

const strategySnapshot = {
  dataset: {
    id: 'strategy-lab-core',
    version: '1.0.0',
    asOf: '2026-08-29T00:00:00.000Z',
    checksumSha256:
      'sha256:21540b6e21ccc999fc65edbbbe5891b762c5bf08b7abb34a58da7cd2ab72c02b',
    methodologyVersion: 'scorecard.v1',
  },
  methodology: {
    objective: 'Rank deterministic fixtures.',
    weights: {
      expectedReturn: 0.25,
      profitFactor: 0.25,
      drawdownProtection: 0.25,
      stability: 0.15,
      winRate: 0.1,
    },
    constraints: { maxDrawdownPct: 12, minProfitFactor: 1.1, maxExposurePct: 35 },
  },
  scenarios: [
    {
      id: 'trend-expansion',
      name: 'Trend expansion',
      marketRegime: 'TRENDING',
      volatility: 'MODERATE',
      description: 'Directional market with sustained momentum.',
      recommendation: {
        strategyCode: 'TREND_H1',
        summary: 'Adaptive Trend H1 ranks first.',
      },
      candidates: [
        {
          rank: 1,
          strategyCode: 'TREND_H1',
          name: 'Adaptive Trend H1',
          timeframe: 'H1',
          eligible: true,
          score: 72.5,
          metrics: {
            expectedReturnPct: 12.8,
            maxDrawdownPct: 7.4,
            winRate: 0.57,
            profitFactor: 1.62,
            stability: 0.84,
            exposurePct: 28,
          },
          scorecard: {
            expectedReturn: 85.3,
            profitFactor: 68.3,
            drawdownProtection: 63,
            stability: 84,
            winRate: 57,
          },
          constraints: [
            {
              code: 'MAX_DRAWDOWN',
              label: 'Maximum drawdown',
              passed: true,
              actual: 7.4,
              limit: 12,
            },
            {
              code: 'MIN_PROFIT_FACTOR',
              label: 'Minimum profit factor',
              passed: true,
              actual: 1.62,
              limit: 1.1,
            },
            {
              code: 'MAX_EXPOSURE',
              label: 'Maximum exposure',
              passed: true,
              actual: 28,
              limit: 35,
            },
          ],
          rationale: ['Composite score 72.5/100 using fixed scorecard.v1 weights.'],
          tradeoffs: ['Lower modeled drawdown improves capital preservation in this scenario.'],
        },
      ],
    },
  ],
  disclaimer: 'Strategy Lab is advisory only.',
};

const openPosition = {
  id: '55555555-5555-4555-8555-555555555555',
  instrument: 'EURUSD',
  direction: 'BUY',
  lotSize: '0.1000',
  requestedEntryPrice: '1.10000000',
  fillPrice: '1.10010000',
  stopLoss: '1.09500000',
  takeProfit: '1.11000000',
  trailingStopPips: null,
  status: 'OPEN',
  exitPrice: null,
  closeReason: null,
  openedAt: '2026-08-31T00:45:00.000Z',
  closedAt: null,
  createdAt: '2026-08-31T00:44:00.000Z',
  updatedAt: '2026-08-31T00:45:00.000Z',
};

const copilotSnapshot = {
  generatedAt: '2026-08-31T01:00:00.000Z',
  instrument: 'EURUSD',
  timeframe: 'H1',
  status: 'READY',
  posture: 'NORMAL',
  headline: 'EURUSD H1 posture is normal with fresh broker market evidence.',
  explanation:
    'Broker market evidence is fresh. The Risk Engine reports a clear gate. Persisted AI decision evidence and deterministic Strategy Lab research are aligned. No trade instruction is issued from this surface.',
  market: {
    freshness: 'FRESH',
    bid: '1.17001',
    ask: '1.17013',
    spread: '0.00012',
    quoteAt: '2026-08-31T01:00:15.000Z',
    retrievedAt: '2026-08-31T01:00:30.000Z',
  },
  risk: {
    killSwitchActive: false,
    brokerConnected: true,
    riskAcknowledgementAccepted: true,
    openPositionSlotsRemaining: 2,
    dailyTradeSlotsRemaining: 8,
    stalePortfolioSnapshots: 0,
    unavailablePortfolioSnapshots: 0,
    recentViolationCount: 0,
  },
  decision: {
    signalId: 'sig_00000000-0000-0000-0000-000000000042',
    outcome: 'RISK_APPROVED',
    direction: 'BUY',
    confidenceScore: 0.82,
    strategyCode: 'TREND_H1',
    modelVersion: 'irex-ai-v2.3',
    marketRegime: 'TREND',
    receivedAt: '2026-08-31T00:55:00.000Z',
    riskDecision: 'APPROVED',
    executionStatus: 'OPEN',
  },
  strategyResearch: {
    datasetId: 'ds_trend_h1_v4',
    datasetVersion: '4.2.0',
    asOf: '2026-08-30T00:00:00.000Z',
    scenarioId: 'trend_h1_normal',
    marketRegime: 'TREND',
    strategyCode: 'TREND_H1',
    eligible: true,
    score: 78.5,
    advisoryOnly: true,
  },
  evidence: [
    { source: 'MARKET', state: 'FRESH', summary: 'Broker quote is fresh.' },
    { source: 'RISK', state: 'AVAILABLE', summary: 'Risk gate is clear.' },
    { source: 'AI_DECISION', state: 'AVAILABLE', summary: 'Persisted AI decision evidence is available.' },
    { source: 'STRATEGY_RESEARCH', state: 'AVAILABLE', summary: 'Deterministic strategy research is available.' },
  ],
  nextChecks: [
    'Confirm broker connection health before considering any execution.',
    'Review the Risk Engine limits for the configured instrument.',
  ],
  policy: {
    explanationOnly: true,
    noTradeInstruction: true,
    hiddenReasoningExposed: false,
    strategyResearchAdvisoryOnly: true,
  },
};

async function gotoCockpit(
  page: Parameters<typeof setupErrorCollectors>[0],
  options?: {
    copilotResponse?: unknown;
    copilotStatus?: number;
    copilotResponses?: unknown[];
  },
) {
  setupErrorCollectors(page);
  let copilotCallIndex = 0;
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
    if (apiPath === 'risk/status') {
      return fulfill(200, {
        killSwitchActive: false,
        brokerConnected: true,
        canTrade: true,
        limits: {
          maxDailyLossPercent: '5',
          maxDrawdownPercent: '10',
          maxOpenTrades: 3,
          maxPositionSizeLot: '1.00',
          allowedInstruments: 'ALL',
          maxVolatilityScore: '7',
        },
      });
    }
    if (apiPath === 'trading/sessions/active') {
      return fulfill(200, {
        id: '44444444-4444-4444-8444-444444444444',
        brokerConnectionId: mockBrokerConnections[0].id,
        status: 'ACTIVE',
        startedAt: '2026-08-31T00:30:00.000Z',
        endedAt: null,
        createdAt: '2026-08-31T00:30:00.000Z',
        updatedAt: '2026-08-31T00:30:00.000Z',
      });
    }
    if (apiPath === 'broker/connections') return fulfill(200, mockBrokerConnections);
    if (apiPath === 'execution/positions/open') return fulfill(200, [openPosition]);
    if (apiPath === 'execution/trades/recent') return fulfill(200, [openPosition]);
    if (apiPath === 'market-data/intelligence') return fulfill(200, marketSnapshot);
    if (apiPath === 'risk/intelligence') return fulfill(200, riskSnapshot);
    if (apiPath === 'ai/decisions') return fulfill(200, decisionSnapshot);
    if (apiPath === 'strategy/lab') return fulfill(200, strategySnapshot);
    if (apiPath === 'ai/copilot/context') {
      if (options?.copilotResponses) {
        const response = options.copilotResponses[copilotCallIndex] ?? copilotSnapshot;
        copilotCallIndex++;
        return fulfill(200, response);
      }
      if (options?.copilotResponse !== undefined) {
        return fulfill(options.copilotStatus ?? 200, options.copilotResponse);
      }
      return fulfill(200, copilotSnapshot);
    }
    return fulfill(200, {});
  });

  await page.goto('/trade');
  await expect(page.getByTestId('dynamic-trader-cockpit')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Trading Workspace' })).toBeVisible();
}

test.describe('Dynamic Trader Cockpit', () => {
  test('composes authoritative market, AI, risk, strategy, broker, and execution state', async ({
    page,
  }) => {
    await gotoCockpit(page);

    await expect(page.locator('.trader-cockpit .terminal-foundation__eyebrow').first()).toHaveText(
      'Dynamic Trader Cockpit',
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Broker Market · EURUSD' })).toBeVisible();
    await expect(page.getByText('1.17001', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('img', { name: /cockpit candlestick chart with 4 broker candles/i })).toBeVisible();

    const decisionCard = page.getByRole('heading', { level: 2, name: 'AI Decision Pulse' }).locator('..');
    await expect(decisionCard.getByText('EURUSD · BUY', { exact: true })).toBeVisible();
    await expect(decisionCard.getByText('82%', { exact: true })).toBeVisible();
    await expect(decisionCard.getByText('TREND_H1', { exact: true })).toBeVisible();

    const guardrailCard = page.getByRole('heading', { level: 2, name: 'Capital Guardrails' }).locator('..');
    await expect(guardrailCard.getByText('1 / 3', { exact: true })).toBeVisible();
    await expect(guardrailCard.getByText('Full Auto', { exact: true })).toBeVisible();

    const strategyCard = page.getByRole('heading', { level: 2, name: 'Strategy Lab Signal' }).locator('..');
    await expect(strategyCard.getByText('TREND_H1', { exact: true })).toBeVisible();
    await expect(strategyCard.getByText('Advisory only', { exact: true })).toBeVisible();

    await expect(page.getByRole('heading', { level: 2, name: 'Open Positions (1)' })).toBeVisible();
    await expect(page.getByText(/authoritative data only/i)).toBeVisible();
    await expect(page.getByText(/browser exposes no direct broker order control/i)).toBeVisible();

    await expect(page.getByText('brokerConnectionId', { exact: false })).toHaveCount(0);
    await expect(page.getByText('providerAccountId', { exact: false })).toHaveCount(0);
    await expect(page.getByText('idempotencyKey', { exact: false })).toHaveCount(0);
    await expect(page.getByText('placeOrder', { exact: false })).toHaveCount(0);

    // Copilot panel assertions
    await expect(page.getByRole('heading', { level: 2, name: 'Contextual AI Copilot' })).toBeVisible();
    await expect(page.getByText('Evidence-based explanation', { exact: false })).toBeVisible();
    const copilotPanel = page.getByRole('heading', { level: 2, name: 'Contextual AI Copilot' }).locator('..');
    await expect(copilotPanel.getByText('No hidden reasoning exposed', { exact: false }).first()).toBeVisible();
    await expect(copilotPanel.getByText('READY', { exact: true })).toBeVisible();
    await expect(copilotPanel.getByText('NORMAL', { exact: true })).toBeVisible();
    await expect(copilotPanel.getByText('EURUSD · H1', { exact: true })).toBeVisible();
    await expect(copilotPanel.getByText('Persisted AI decision evidence', { exact: false }).first()).toBeVisible();
    await expect(copilotPanel.getByText('Historical research · Advisory only', { exact: false })).toBeVisible();
    await expect(copilotPanel.getByText('Explanation only · No trade instruction · No hidden reasoning exposed', { exact: false })).toBeVisible();

    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  test('remains structurally responsive across the nine release viewports', async ({ page }) => {
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

    await gotoCockpit(page);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(page.getByTestId('dynamic-trader-cockpit')).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }

    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  // ── Sprint 42: Copilot fail-closed regression coverage ──────────────────────

  test('Copilot rejects a broadened payload with an unexpected providerAccountId field', async ({
    page,
  }) => {
    const broadened = { ...copilotSnapshot, providerAccountId: 'broker-account-leak-123' };
    await gotoCockpit(page, { copilotResponse: broadened });

    // The validator must reject the entire response — Copilot data must NOT render.
    const copilotPanel = page.getByRole('heading', { level: 2, name: 'Contextual AI Copilot' }).locator('..');
    await expect(copilotPanel.getByText('READY', { exact: true })).toHaveCount(0);
    await expect(copilotPanel.getByText('NORMAL', { exact: true })).toHaveCount(0);
    await expect(copilotPanel.getByText('EURUSD · H1', { exact: true })).toHaveCount(0);

    // The forbidden field must never render in the DOM.
    await expect(page.getByText('broker-account-leak-123', { exact: false })).toHaveCount(0);
    await expect(page.getByText('providerAccountId', { exact: false })).toHaveCount(0);

    // An unavailable/error state must be shown instead.
    await expect(copilotPanel.getByText(/Contextual AI Copilot is unavailable/i)).toBeVisible();

    assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  test('Copilot rejects a policy violation (noTradeInstruction: false)', async ({ page }) => {
    const violated = {
      ...copilotSnapshot,
      policy: {
        ...copilotSnapshot.policy,
        noTradeInstruction: false,
      },
    };
    await gotoCockpit(page, { copilotResponse: violated });

    const copilotPanel = page.getByRole('heading', { level: 2, name: 'Contextual AI Copilot' }).locator('..');
    await expect(copilotPanel.getByText('READY', { exact: true })).toHaveCount(0);
    await expect(copilotPanel.getByText('NORMAL', { exact: true })).toHaveCount(0);
    await expect(copilotPanel.getByText(/Contextual AI Copilot is unavailable/i)).toBeVisible();

    assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });

  test('Copilot clears previous evidence on refresh failure', async ({ page }) => {
    // First load: valid Copilot data renders.
    // Second load (refresh): endpoint fails — old content must clear.
    await gotoCockpit(page, {
      copilotResponses: [
        copilotSnapshot, // first call: valid
        { error: 'internal server error' }, // second call: invalid (will fail validation)
      ],
    });

    // Verify valid Copilot data rendered on first load.
    const copilotPanel = page.getByRole('heading', { level: 2, name: 'Contextual AI Copilot' }).locator('..');
    await expect(copilotPanel.getByText('READY', { exact: true })).toBeVisible();
    await expect(copilotPanel.getByText('NORMAL', { exact: true })).toBeVisible();

    // Click refresh — the second Copilot response is invalid.
    await page.getByRole('button', { name: /refresh cockpit/i }).click();

    // Old Copilot content must be cleared immediately and must not remain displayed.
    await expect(copilotPanel.getByText('READY', { exact: true })).toHaveCount(0);
    await expect(copilotPanel.getByText('NORMAL', { exact: true })).toHaveCount(0);
    await expect(copilotPanel.getByText('EURUSD · H1', { exact: true })).toHaveCount(0);

    // An unavailable/error state must be shown.
    await expect(copilotPanel.getByText(/Contextual AI Copilot is unavailable/i)).toBeVisible();

    assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
    assertNoExternalRequests(page);
  });
});
