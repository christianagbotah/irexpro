import { test, expect, type Page } from '@playwright/test';
import {
  assertNoConsoleErrors,
  assertNoFailedRequests,
  assertNoHorizontalOverflow,
  mockAdminTokens,
  mockAdminUser,
  setupErrorCollectors,
} from './fixtures';

const POLICY_VERSION = 'eligibility.2026-09';
const POLICY_FINGERPRINT = 'f'.repeat(64);

const disclosureDefinitions = [
  {
    key: 'AUTOMATED_TRADING_RISK',
    version: '1.0',
    title: 'Automated trading risk',
    body: 'Automated decisions can result in financial loss and controls cannot eliminate market risk.',
    contentSha256: 'a'.repeat(64),
    required: true,
  },
  {
    key: 'NO_PROFIT_GUARANTEE',
    version: '1.0',
    title: 'No profit guarantee',
    body: 'Historical research and prior results do not guarantee future profits or prevent losses.',
    contentSha256: 'b'.repeat(64),
    required: true,
  },
  {
    key: 'BROKER_EXECUTION_AUTHORITY',
    version: '1.0',
    title: 'Broker execution authority',
    body: 'Any separately enabled execution remains subject to platform controls and broker acceptance.',
    contentSha256: 'c'.repeat(64),
    required: true,
  },
  {
    key: 'LEGAL_ELIGIBILITY_ATTESTATION',
    version: '1.0',
    title: 'Age and legal eligibility attestation',
    body: 'The adult account holder confirms legal capacity and jurisdictional eligibility for the service.',
    contentSha256: 'd'.repeat(64),
    required: true,
  },
] as const;

const reviewQueue = [
  {
    userId: 'usr_review_00000000-0000-0000-0000-000000000001',
    email: 'review.candidate.with.a.long.address@example.com',
    countryCode: 'NG',
    policyVersion: POLICY_VERSION,
    policyFingerprint: POLICY_FINGERPRINT,
    jurisdictionStatus: 'REVIEW_REQUIRED',
    reasonCode: 'POLICY_REVIEW_REQUIRED',
  },
];

const deniedStatus = {
  policyVersion: POLICY_VERSION,
  policyFingerprint: POLICY_FINGERPRINT,
  countryCode: 'NG',
  jurisdictionStatus: 'INELIGIBLE',
  decisionSource: 'ADMIN_REVIEW',
  reasonCode: 'JURISDICTION_REVIEW_DENIED',
  reviewedAt: '2026-09-01T09:15:00.000Z',
  ageStatus: 'ADULT',
  kycStatus: 'APPROVED',
  identityReasonCode: 'IDENTITY_APPROVED',
  disclosures: disclosureDefinitions,
  consents: [],
  missingConsentKeys: disclosureDefinitions.map((item) => item.key),
  canProceed: false,
};

function fulfill(
  route: Parameters<Parameters<Page['route']>[1]>[0],
  status: number,
  body: unknown,
) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installAdminRoutes(
  page: Page,
  options: { onReview?: (body: unknown) => void } = {},
) {
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.split('/api/v1/')[1] ?? '';

    if (apiPath === 'auth/refresh') return fulfill(route, 200, mockAdminTokens);
    if (apiPath === 'auth/me') return fulfill(route, 200, mockAdminUser);
    if (apiPath === 'auth/logout') return fulfill(route, 200, { message: 'Logged out' });
    if (apiPath === 'admin/eligibility/reviews' && request.method() === 'GET') {
      return fulfill(route, 200, reviewQueue);
    }
    if (
      apiPath ===
        'admin/eligibility/users/usr_review_00000000-0000-0000-0000-000000000001/review' &&
      request.method() === 'POST'
    ) {
      options.onReview?.(request.postDataJSON());
      return fulfill(route, 200, deniedStatus);
    }
    return fulfill(route, 200, {});
  });
}

test.describe('Sprint 46 admin jurisdiction reviews', () => {
  test('renders only frontend-safe review evidence and exact policy context', async ({ page }) => {
    setupErrorCollectors(page);
    await installAdminRoutes(page);

    await page.goto('/admin/eligibility-reviews');

    await expect(page.getByRole('heading', { level: 1, name: 'Eligibility reviews' })).toBeVisible();
    await expect(page.getByText(reviewQueue[0].email, { exact: true })).toBeVisible();
    await page.getByText(reviewQueue[0].email, { exact: true }).click();
    await expect(page.getByText(POLICY_VERSION, { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(POLICY_FINGERPRINT))).toBeVisible();
    await expect(page.getByText(/POLICY_REVIEW_REQUIRED/)).toBeVisible();

    await expect(page.getByText('passwordHash', { exact: false })).toHaveCount(0);
    await expect(page.getByText('brokerConnectionId', { exact: false })).toHaveCount(0);
    await expect(page.getByText('providerAccountId', { exact: false })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
  });

  test('requires explicit confirmation and posts the exact reviewed policy snapshot', async ({ page }) => {
    setupErrorCollectors(page);
    let submittedBody: unknown;
    await installAdminRoutes(page, {
      onReview: (body) => {
        submittedBody = body;
      },
    });

    await page.goto('/admin/eligibility-reviews');
    await page.getByText(reviewQueue[0].email, { exact: true }).click();
    await page.locator('#eligibility-decision').selectOption('DENIED');
    await page.locator('#eligibility-reason-code').fill('jurisdiction review denied');
    await page.locator('#eligibility-review-note').fill('Reviewed against the current jurisdiction policy.');

    await page.getByRole('button', { name: 'Deny eligibility' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /confirm the reviewed eligibility decision/i }),
    ).toContainText(/confirm the reviewed eligibility decision/i);
    expect(submittedBody).toBeUndefined();

    await page.getByRole('checkbox', { name: /I confirm this reviewed jurisdiction decision/i }).check();
    await page.getByRole('button', { name: 'Deny eligibility' }).click();

    expect(submittedBody).toEqual({
      policyVersion: POLICY_VERSION,
      policyFingerprint: POLICY_FINGERPRINT,
      decision: 'DENIED',
      reasonCode: 'JURISDICTION_REVIEW_DENIED',
      reviewerNote: 'Reviewed against the current jurisdiction policy.',
    });
    await expect(page.getByText('No pending eligibility reviews', { exact: true })).toBeVisible();

    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
  });

  test('has no horizontal overflow across nine target viewports', async ({ page }) => {
    setupErrorCollectors(page);
    await installAdminRoutes(page);

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

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/admin/eligibility-reviews');
      await expect(page.getByRole('heading', { level: 1, name: 'Eligibility reviews' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }

    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
  });
});
