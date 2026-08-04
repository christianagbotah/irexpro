import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import type {
  AuthUser,
  OnboardingStatus,
  RiskProfile,
  BrokerConnectionView,
  SupportedBroker,
} from '@irexpro/types';

/**
 * Shared E2E fixtures for the iRexPro web Playwright suite.
 *
 * Authentication strategy: route interception (mocking). Every API call the
 * AuthProvider / pages make is intercepted via `page.route()` and fulfilled
 * with deterministic fixture data. No real backend is contacted, no test
 * passwords live in source, and no auth bypass is added to the app.
 *
 * Route matching: a SINGLE page.route() handler catches all `/api/v1/**`
 * requests and dispatches based on the URL path + HTTP method. This avoids
 * any ambiguity in Playwright's multi-route registration order and keeps the
 * interception logic in one readable place.
 */

// ── Mock data ────────────────────────────────────────────────────────────────

export const mockAuthUser: AuthUser = {
  id: 'usr_00000000-0000-0000-0000-000000000001',
  email: 'adaezi.okafor@example.com',
  phone: '+233241234567',
  firstName: 'Adaezi',
  lastName: 'Okafor',
  countryCode: 'GH',
  status: 'ACTIVE',
  roles: ['USER'],
  mfaEnabled: false,
  lastLoginAt: '2025-01-15T10:00:00.000Z',
  createdAt: '2024-09-01T08:00:00.000Z',
};

export const mockAuthTokens = {
  accessToken: 'mock-access-token-for-e2e-tests-not-a-real-jwt',
  refreshToken: 'mock-refresh-token-for-e2e-tests-not-a-real-jwt',
};

export const mockUserProfile = {
  id: mockAuthUser.id,
  email: mockAuthUser.email,
  phone: mockAuthUser.phone,
  countryCode: mockAuthUser.countryCode,
  timezone: 'Africa/Accra',
  preferredCurrency: 'USD',
  profile: {
    tradingExperienceLevel: 'INTERMEDIATE' as const,
  },
};

export const mockOnboardingStatus: OnboardingStatus = {
  profileCompleted: true,
  riskProfileCompleted: true,
  brokerConnected: true,
  brokerConnectionStatus: 'CONNECTED',
  canStartTrading: true,
  missingSteps: [],
  nextStep: 'READY',
};

export const mockRiskProfile: RiskProfile = {
  id: 'rp_00000000-0000-0000-0000-000000000001',
  userId: mockAuthUser.id,
  killSwitchActive: false,
  killSwitchReason: null,
  maxDailyLossPercent: '5',
  maxDrawdownPercent: '10',
  maxOpenTrades: 3,
  maxDailyTrades: 10,
  maxPositionSizeLot: '1.00',
  minStopLossPips: '10',
  allowedInstruments: null,
  maxVolatilityScore: '7',
  rejectLowLiquidity: true,
  riskAcknowledgementAccepted: false,
  riskAcknowledgementAcceptedAt: null,
  maxTradeRiskPercent: '2',
  maxLeverageAllowed: 30,
  allowedTradingModes: 'PAPER_ONLY',
  createdAt: '2025-01-10T08:00:00.000Z',
  updatedAt: '2025-01-10T08:00:00.000Z',
};

export const mockSupportedBrokers: SupportedBroker[] = [
  {
    brokerId: 'paper-broker',
    brokerName: 'Paper Broker',
    supportsDemo: true,
    supportsLive: false,
  },
  {
    brokerId: 'metatrader5',
    brokerName: 'MetaTrader 5',
    supportsDemo: true,
    supportsLive: true,
  },
];

export const mockBrokerConnections: BrokerConnectionView[] = [
  {
    id: 'bconn_00000000-0000-0000-0000-000000000001',
    userId: mockAuthUser.id,
    brokerId: 'paper-broker',
    brokerName: 'Paper Broker',
    displayName: 'Demo paper account',
    accountId: 'paper-acc-001',
    accountType: 'DEMO',
    accountCurrency: 'USD',
    accountLeverage: 1,
    status: 'CONNECTED',
    demoValidated: true,
    liveTradingEnabled: false,
    lastHealthCheckAt: '2025-01-15T09:55:00.000Z',
    lastSyncAt: '2025-01-15T09:55:00.000Z',
    lastErrorMessage: null,
    createdAt: '2025-01-05T08:00:00.000Z',
    updatedAt: '2025-01-15T09:55:00.000Z',
  },
];

// ── Route interception ───────────────────────────────────────────────────────

function jsonFulfill(status: number, body: unknown) {
  return {
    status,
    contentType: 'application/json' as const,
    body: JSON.stringify(body),
  };
}

function parseBody(postData: string | null): Record<string, unknown> {
  if (!postData) return {};
  try {
    return JSON.parse(postData) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * The API path prefix. The web app's API client concatenates
 * NEXT_PUBLIC_API_BASE_URL (e.g. "http://localhost:3999/api/v1") with a path
 * like "/auth/refresh". We match on the path that follows the base.
 */
const API_PATH_PREFIX = '/api/v1/';

/**
 * Extract the API path (without the /api/v1/ prefix and without query string)
 * from a full request URL. Returns an empty string if the URL is not under
 * /api/v1/.
 */
function extractApiPath(fullUrl: string): string {
  const idx = fullUrl.indexOf(API_PATH_PREFIX);
  if (idx < 0) return '';
  return fullUrl.slice(idx + API_PATH_PREFIX.length).split('?')[0];
}

/**
 * Intercept every API call the authenticated pages make and respond with
 * deterministic fixture data. A single route handler catches all `/api/v1/**`
 * requests and dispatches based on path + method, so there are no
 * route-registration-order ambiguities.
 */
export async function setupAuthInterception(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const method = request.method();
    const apiPath = extractApiPath(request.url());

    // ── Auth ────────────────────────────────────────────────────────────
    if (apiPath === 'auth/refresh') {
      return route.fulfill(jsonFulfill(200, mockAuthTokens));
    }
    if (apiPath === 'auth/me') {
      return route.fulfill(jsonFulfill(200, mockAuthUser));
    }
    if (apiPath === 'auth/logout') {
      return route.fulfill(jsonFulfill(200, { message: 'Logged out' }));
    }

    // ── Users / onboarding ──────────────────────────────────────────────
    if (apiPath === 'users/me/onboarding-status') {
      return route.fulfill(jsonFulfill(200, mockOnboardingStatus));
    }
    if (apiPath === 'users/me') {
      if (method === 'PATCH') {
        return route.fulfill(
          jsonFulfill(200, { ...mockUserProfile, ...parseBody(request.postData()) }),
        );
      }
      return route.fulfill(jsonFulfill(200, mockUserProfile));
    }

    // ── Risk ────────────────────────────────────────────────────────────
    if (apiPath === 'risk/profile') {
      if (method === 'PATCH') {
        return route.fulfill(
          jsonFulfill(200, {
            ...mockRiskProfile,
            ...parseBody(request.postData()),
            riskAcknowledgementAccepted: true,
            riskAcknowledgementAcceptedAt: new Date().toISOString(),
          }),
        );
      }
      return route.fulfill(jsonFulfill(200, mockRiskProfile));
    }

    // ── Broker ──────────────────────────────────────────────────────────
    // Static segments must be checked before the dynamic :id segment.
    if (apiPath === 'broker/connections/supported') {
      return route.fulfill(jsonFulfill(200, mockSupportedBrokers));
    }
    if (apiPath === 'broker/connections/test') {
      return route.fulfill(jsonFulfill(200, { success: true, accountId: 'paper-acc-001' }));
    }
    if (apiPath === 'broker/connections') {
      if (method === 'POST') {
        return route.fulfill(jsonFulfill(201, mockBrokerConnections[0]));
      }
      return route.fulfill(jsonFulfill(200, mockBrokerConnections));
    }
    // Dynamic :id sub-routes.
    const brokerConnMatch = apiPath.match(/^broker\/connections\/([^/]+)(?:\/(connect|disconnect))?$/);
    if (brokerConnMatch) {
      const [, , action] = brokerConnMatch;
      if (action === 'connect') {
        return route.fulfill(
          jsonFulfill(200, { ...mockBrokerConnections[0], status: 'CONNECTED' }),
        );
      }
      if (action === 'disconnect') {
        return route.fulfill(
          jsonFulfill(200, { ...mockBrokerConnections[0], status: 'DISCONNECTED' }),
        );
      }
      // No action → the connection :id itself.
      if (method === 'DELETE') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill(jsonFulfill(200, mockBrokerConnections[0]));
    }

    // ── Trading ─────────────────────────────────────────────────────────
    if (apiPath === 'trading/sessions/start') {
      return route.fulfill(
        jsonFulfill(201, {
          id: 'sess_00000000-0000-0000-0000-000000000001',
          status: 'ACTIVE',
          requestedMode: 'PAPER_ONLY',
          startedAt: new Date().toISOString(),
        }),
      );
    }

    // ── Subscriptions / payments (defensive — not exercised by target pages) ──
    if (apiPath.startsWith('subscriptions/') || apiPath === 'subscriptions') {
      return route.fulfill(jsonFulfill(200, []));
    }
    if (apiPath.startsWith('payments/') || apiPath === 'payments') {
      return route.fulfill(jsonFulfill(200, []));
    }

    // ── Catch-all: any unhandled /api/v1/ route returns an empty 200 so no
    // test produces a spurious "failed request" from an unmocked call.
    return route.fulfill(jsonFulfill(200, {}));
  });

  // Silence favicon 404s so they don't show up as failed requests.
  await page.route('**/favicon.ico', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
}

/**
 * Intercept only the auth refresh endpoint and return 401. This simulates the
 * "no httpOnly refresh cookie" / "expired session" state the AuthProvider treats
 * as "user is unauthenticated".
 */
export async function setupUnauthenticatedInterception(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill(jsonFulfill(401, { statusCode: 401, message: 'Unauthorized' })),
  );
  await page.route('**/favicon.ico', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
}

// ── Error / invariant collectors ─────────────────────────────────────────────

interface ErrorCollector {
  consoleErrors: string[];
  failedRequests: string[];
}

const pageCollectors = new WeakMap<Page, ErrorCollector>();

// URL substrings that may legitimately return non-2xx during tests without
// indicating a real bug. Kept conservative so real regressions still surface.
const IGNORED_FAILURE_PATTERNS = [/favicon\.ico/i, /\/_next\//i, /localhost:3999\/api\/v1\/auth\/refresh/i];

// Console-error substrings that are expected noise (typically CORS preflight
// chatter or cross-origin blocking messages emitted by the browser even when
// the request itself was intercepted) and should NOT fail a test. Kept narrow
// so genuine runtime errors still surface. This is the "CORS noise allowlist"
// referenced by assertNoConsoleErrors().
const IGNORED_CONSOLE_ERROR_PATTERNS = [
  /has been blocked by CORS policy/i,
  /No 'Access-Control-Allow-Origin'/i,
  /Cross-Origin Read Blocking/i,
];

/**
 * Attach console + network-failure collectors to a page. Must be called BEFORE
 * navigating to the page under test so events aren't missed. Each test should
 * call this once at the top, then call `assertNoConsoleErrors(page)` and
 * `assertNoFailedRequests(page)` at the end.
 */
export function setupErrorCollectors(page: Page): void {
  const collector: ErrorCollector = { consoleErrors: [], failedRequests: [] };
  pageCollectors.set(page, collector);

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Filter out expected CORS noise so it doesn't produce spurious failures.
    if (IGNORED_CONSOLE_ERROR_PATTERNS.some((re) => re.test(text))) return;
    collector.consoleErrors.push(`[console.error] ${text}`);
  });

  page.on('pageerror', (err) => {
    collector.consoleErrors.push(`[pageerror] ${err.message}`);
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (IGNORED_FAILURE_PATTERNS.some((re) => re.test(url))) return;
    collector.failedRequests.push(`${status} ${response.request().method()} ${url}`);
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (IGNORED_FAILURE_PATTERNS.some((re) => re.test(url))) return;
    collector.failedRequests.push(
      `FAILED ${request.method()} ${url} — ${request.failure()?.errorText ?? 'unknown'}`,
    );
  });
}

/**
 * Fail the test if any unexpected console errors were collected since
 * `setupErrorCollectors(page)` was called.
 */
export function assertNoConsoleErrors(page: Page): void {
  const collector = pageCollectors.get(page);
  if (!collector) {
    throw new Error('assertNoConsoleErrors: call setupErrorCollectors(page) first');
  }
  if (collector.consoleErrors.length > 0) {
    throw new Error(
      `Unexpected console errors (${collector.consoleErrors.length}):\n${collector.consoleErrors.join('\n')}`,
    );
  }
}

/**
 * Fail the test if any non-2xx HTTP responses or network-failed requests were
 * collected. favicon.ico and other ignored patterns are filtered out.
 */
export function assertNoFailedRequests(page: Page): void {
  const collector = pageCollectors.get(page);
  if (!collector) {
    throw new Error('assertNoFailedRequests: call setupErrorCollectors(page) first');
  }
  if (collector.failedRequests.length > 0) {
    throw new Error(
      `Unexpected failed requests (${collector.failedRequests.length}):\n${collector.failedRequests.join('\n')}`,
    );
  }
}

// ── Viewport / layout assertions ─────────────────────────────────────────────

/**
 * Assert the document has no horizontal overflow (scrollWidth <= clientWidth).
 * Catches responsive layout regressions where a fixed-width element breaks the
 * viewport at smaller breakpoints.
 */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(
    metrics.scrollWidth,
    `Horizontal overflow: scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
}

/**
 * Assert an element's bounding box is entirely inside the viewport (both
 * horizontally and vertically). Used to verify dropdowns, tooltips, and
 * dialogs don't get clipped by the viewport edge.
 */
export async function assertBoundingBoxInViewport(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'Element has no bounding box (not visible)').not.toBeNull();
  if (!box) return;

  const viewport = locator.page().viewportSize();
  expect(viewport, 'Page has no viewport size').not.toBeNull();
  if (!viewport) return;

  // 1px tolerance for subpixel rounding
  expect(box.x, `Element left=${box.x} is outside viewport left=0`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `Element top=${box.y} is outside viewport top=0`).toBeGreaterThanOrEqual(-1);
  expect(
    box.x + box.width,
    `Element right=${box.x + box.width} overflows viewport width=${viewport.width}`,
  ).toBeLessThanOrEqual(viewport.width + 1);
  expect(
    box.y + box.height,
    `Element bottom=${box.y + box.height} overflows viewport height=${viewport.height}`,
  ).toBeLessThanOrEqual(viewport.height + 1);
}

// ── Composite helpers ────────────────────────────────────────────────────────

/**
 * Convenience: navigate to a page as an authenticated user and wait for the
 * AuthProvider to finish restoring (the dashboard shell renders). Returns once
 * the main heading of the page is visible — a stable signal that the page has
 * hydrated and the auth-gated content has rendered.
 */
export async function gotoAsAuthenticated(
  page: Page,
  path: string,
  waitFor: { heading?: string | RegExp } = {},
): Promise<void> {
  await setupErrorCollectors(page);
  await setupAuthInterception(page);
  await page.goto(path);
  // Wait for the AuthProvider to flip `restoring` to false. The dashboard
  // shell renders an <h1> once authenticated — wait for it.
  if (waitFor.heading) {
    await expect(page.getByRole('heading', { level: 1, name: waitFor.heading })).toBeVisible();
  } else {
    // Generic wait: the "Restoring session…" placeholder disappears and an <h1>
    // appears once the page has rendered its auth-gated content.
    await expect(page.getByText('Restoring session…')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
}
