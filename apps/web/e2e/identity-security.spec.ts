import { expect, test, type Page, type Route } from '@playwright/test';
import { assertNoHorizontalOverflow } from './fixtures';

const TOKENS = {
  accessToken: 'identity-security-e2e-access-token',
  refreshToken: 'identity-security-e2e-refresh-token',
};

const BASE_USER = {
  id: 'usr_identity_security_e2e',
  email: 'security-user@example.com',
  phone: '+233241234567',
  firstName: 'Security',
  lastName: 'User',
  countryCode: 'GH',
  status: 'ACTIVE',
  roles: ['USER'],
  mfaEnabled: false,
  emailVerified: false,
  phoneVerified: false,
  lastLoginAt: '2026-09-03T08:00:00.000Z',
  createdAt: '2026-08-01T08:00:00.000Z',
};

function apiPath(route: Route): string {
  const url = new URL(route.request().url());
  const marker = '/api/v1/';
  const index = url.pathname.indexOf(marker);
  return index >= 0 ? url.pathname.slice(index + marker.length) : '';
}

function json(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

async function silenceFavicon(page: Page) {
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
}

test.describe('Sprint 49 identity security UX', () => {
  test('web login submits an optional six-digit authenticator code without probing MFA state', async ({ page }) => {
    let loginBody: Record<string, unknown> | null = null;
    await silenceFavicon(page);
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === 'auth/refresh') {
        return route.fulfill(json(401, { statusCode: 401, message: 'Unauthorized' }));
      }
      if (path === 'auth/login') {
        loginBody = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill(json(200, TOKENS));
      }
      if (path === 'auth/me') {
        return route.fulfill(json(200, { ...BASE_USER, mfaEnabled: true }));
      }
      return route.fulfill(json(200, {}));
    });

    await page.goto('/login');
    await page.getByLabel('Email or international phone number').fill('security-user@example.com');
    await page.getByLabel('Password').fill('not-a-real-test-password');
    const mfaInput = page.getByLabel('Authenticator code (if enabled)');
    await expect(mfaInput).toBeVisible();
    await mfaInput.fill('123456');

    const loginRequest = page.waitForRequest((request) => request.url().includes('/api/v1/auth/login'));
    await page.getByRole('button', { name: /^log in$/i }).click();
    await loginRequest;

    expect(loginBody).toMatchObject({
      identifier: 'security-user@example.com',
      mfaCode: '123456',
    });
    expect(loginBody).not.toHaveProperty('mfaRequired');
  });

  test('MFA setup material remains memory-only and is never written to browser storage', async ({ page }) => {
    const setupSecret = 'JBSWY3DPEHPK3PXP';
    await silenceFavicon(page);
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === 'auth/refresh') return route.fulfill(json(200, TOKENS));
      if (path === 'auth/me') return route.fulfill(json(200, BASE_USER));
      if (path === 'auth/mfa/setup') {
        return route.fulfill(json(200, {
          secret: setupSecret,
          otpauthUri: `otpauth://totp/iRexPro:test?secret=${setupSecret}`,
        }));
      }
      return route.fulfill(json(200, { message: 'ok' }));
    });

    await page.goto('/security');
    await expect(page.getByRole('heading', { level: 1, name: 'Account Security' })).toBeVisible();
    await page.getByRole('button', { name: 'Start authenticator setup' }).click();
    await expect(page.getByText(setupSecret)).toBeVisible();

    const storageSnapshot = await page.evaluate(() => ({
      local: Object.values(localStorage),
      session: Object.values(sessionStorage),
    }));
    expect(JSON.stringify(storageSnapshot)).not.toContain(setupSecret);
    expect(page.url()).not.toContain(setupSecret);
    await assertNoHorizontalOverflow(page);
  });

  test('phone verification submits only the six-digit code and refreshes safe verification state', async ({ page }) => {
    let phoneVerified = false;
    let confirmBody: Record<string, unknown> | null = null;
    await silenceFavicon(page);
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === 'auth/refresh') return route.fulfill(json(200, TOKENS));
      if (path === 'auth/me') {
        return route.fulfill(json(200, { ...BASE_USER, phoneVerified }));
      }
      if (path === 'auth/verification/phone/request') {
        return route.fulfill(json(200, { message: 'Verification code sent' }));
      }
      if (path === 'auth/verification/phone/confirm') {
        confirmBody = route.request().postDataJSON() as Record<string, unknown>;
        phoneVerified = true;
        return route.fulfill(json(200, { message: 'Phone verified' }));
      }
      return route.fulfill(json(200, { message: 'ok' }));
    });

    await page.goto('/security');
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await page.getByLabel('6-digit SMS verification code').fill('654321');
    await page.getByRole('button', { name: 'Confirm phone' }).click();

    await expect(page.getByText('Your phone number is verified.')).toBeVisible();
    expect(confirmBody).toEqual({ code: '654321' });
    const stored = await page.evaluate(() => `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`);
    expect(stored).not.toContain('654321');
  });

  test('single-use email token is confirmed explicitly then removed from the visible URL', async ({ page }) => {
    const token = 'single-use-email-token-e2e';
    let confirmBody: Record<string, unknown> | null = null;
    await silenceFavicon(page);
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === 'auth/refresh') {
        return route.fulfill(json(401, { statusCode: 401, message: 'Unauthorized' }));
      }
      if (path === 'auth/verification/email/confirm') {
        confirmBody = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill(json(200, { message: 'Email verified' }));
      }
      return route.fulfill(json(200, {}));
    });

    await page.goto(`/verify-email?token=${encodeURIComponent(token)}`);
    await expect(page.getByText(token)).toHaveCount(0);
    await expect(page).toHaveURL(/\/verify-email$/);
    expect(page.url()).not.toContain(token);
    await page.getByRole('button', { name: 'Confirm email' }).click();

    await expect(page).toHaveURL(/\/verify-email\?verified=1$/);
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
    expect(page.url()).not.toContain(token);
    expect(confirmBody).toEqual({ token });
    const storage = await page.evaluate(() => `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`);
    expect(storage).not.toContain(token);
  });

  test('Security is reachable from the responsive account navigation', async ({ page }) => {
    await silenceFavicon(page);
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === 'auth/refresh') return route.fulfill(json(200, TOKENS));
      if (path === 'auth/me') return route.fulfill(json(200, BASE_USER));
      return route.fulfill(json(200, {}));
    });

    await page.goto('/security');
    await expect(page.getByRole('heading', { level: 1, name: 'Account Security' })).toBeVisible();
    const viewport = page.viewportSize();
    // Workspace navigation switches from sidebar to the mobile bottom nav at
    // the product CSS breakpoint: @media (max-width: 700px).
    if (viewport && viewport.width <= 700) {
      await page.getByRole('button', { name: 'More navigation' }).click();
      await expect(page.getByRole('dialog').getByRole('link', { name: 'Security' })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Primary workspace navigation' }).getByRole('link', { name: 'Security' })).toBeVisible();
    }
    await assertNoHorizontalOverflow(page);
  });
});
