import { test, expect, type Page } from '@playwright/test';
import {
  assertNoConsoleErrors,
  assertNoFailedRequests,
  assertNoHorizontalOverflow,
  mockAdminTokens,
  mockAdminUser,
  setupErrorCollectors,
} from './fixtures';

const disclosureDefinitions = [
  {
    key: 'AUTOMATED_TRADING_RISK',
    version: '1.0',
    title: 'Automated trading risk',
    body: 'Automated decisions can result in financial loss.',
    contentSha256: 'a'.repeat(64),
    required: true,
  },
  {
    key: 'NO_PROFIT_GUARANTEE',
    version: '1.0',
    title: 'No profit guarantee',
    body: 'Prior results do not guarantee future profits.',
    contentSha256: 'b'.repeat(64),
    required: true,
  },
  {
    key: 'BROKER_EXECUTION_AUTHORITY',
    version: '1.0',
    title: 'Broker execution authority',
    body: 'Any separately enabled execution remains subject to controls.',
    contentSha256: 'c'.repeat(64),
    required: true,
  },
  {
    key: 'LEGAL_ELIGIBILITY_ATTESTATION',
    version: '1.0',
    title: 'Age and legal eligibility attestation',
    body: 'The adult account holder confirms legal eligibility.',
    contentSha256: 'd'.repeat(64),
    required: true,
  },
] as const;

const kycQueue = [
  {
    userId: 'usr_kyc_00000000-0000-0000-0000-000000000001',
    email: 'adult.identity.review.with.a.long.address@example.com',
    countryCode: 'GH',
    dateOfBirth: '1990-04-12',
    ageStatus: 'ADULT',
    kycStatus: 'PENDING',
    reasonCode: 'KYC_PENDING',
  },
];

const approvedStatus = {
  policyVersion: 'eligibility.2026-09',
  countryCode: 'GH',
  jurisdictionStatus: 'ELIGIBLE',
  decisionSource: 'POLICY',
  reasonCode: 'POLICY_ALLOWED',
  reviewedAt: null,
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

async function installKycRoutes(
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
    if (apiPath === 'admin/identity/kyc/reviews' && request.method() === 'GET') {
      return fulfill(route, 200, kycQueue);
    }
    if (
      apiPath ===
        'admin/identity/users/usr_kyc_00000000-0000-0000-0000-000000000001/kyc-review' &&
      request.method() === 'POST'
    ) {
      options.onReview?.(request.postDataJSON());
      return fulfill(route, 200, approvedStatus);
    }
    return fulfill(route, 200, {});
  });
}

test.describe('Sprint 45 admin KYC reviews', () => {
  test('renders only frontend-safe adult KYC review context', async ({ page }) => {
    setupErrorCollectors(page);
    await installKycRoutes(page);

    await page.goto('/admin/kyc-reviews');

    await expect(page.getByRole('heading', { level: 1, name: 'KYC reviews' })).toBeVisible();
    await expect(page.getByText(kycQueue[0].email, { exact: true })).toBeVisible();
    await page.getByText(kycQueue[0].email, { exact: true }).click();
    await expect(page.getByText(/1990-04-12/)).toBeVisible();
    await expect(page.getByText(/ADULT/)).toBeVisible();
    await expect(page.getByText(/not the identity-verification process itself/i)).toBeVisible();

    await expect(page.getByText('passwordHash', { exact: false })).toHaveCount(0);
    await expect(page.getByText('reviewerUserId', { exact: false })).toHaveCount(0);
    await expect(page.getByText('brokerConnectionId', { exact: false })).toHaveCount(0);
    await expect(page.getByText('providerAccountId', { exact: false })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);
    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
  });

  test('requires explicit compliance confirmation before recording KYC approval', async ({ page }) => {
    setupErrorCollectors(page);
    let submittedBody: unknown;
    await installKycRoutes(page, {
      onReview: (body) => {
        submittedBody = body;
      },
    });

    await page.goto('/admin/kyc-reviews');
    await page.getByText(kycQueue[0].email, { exact: true }).click();
    await page.locator('#kyc-decision').selectOption('APPROVED');
    await page.locator('#kyc-reason-code').fill('manual identity verified');
    await page.locator('#kyc-review-note').fill('Approved compliance workflow completed.');

    await page.getByRole('button', { name: 'Approve KYC' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /approved compliance verification process was completed/i }),
    ).toBeVisible();
    expect(submittedBody).toBeUndefined();

    await page
      .getByRole('checkbox', {
        name: /I confirm identity verification was completed using the approved compliance process/i,
      })
      .check();
    await page.getByRole('button', { name: 'Approve KYC' }).click();

    expect(submittedBody).toEqual({
      decision: 'APPROVED',
      reasonCode: 'MANUAL_IDENTITY_VERIFIED',
      reviewerNote: 'Approved compliance workflow completed.',
    });
    await expect(page.getByText('No pending KYC reviews', { exact: true })).toBeVisible();

    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
  });

  test('has no horizontal overflow across nine target viewports', async ({ page }) => {
    setupErrorCollectors(page);
    await installKycRoutes(page);

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
      await page.goto('/admin/kyc-reviews');
      await expect(page.getByRole('heading', { level: 1, name: 'KYC reviews' })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }

    assertNoConsoleErrors(page);
    assertNoFailedRequests(page);
  });
});
