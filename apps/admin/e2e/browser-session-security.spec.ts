import { expect, test, type Page, type Route } from '@playwright/test';

const ADMIN_USER = {
  id: 'usr_admin_browser_session_e2e',
  email: 'admin-browser-session@example.com',
  phone: null,
  firstName: 'Admin',
  lastName: 'Session',
  countryCode: 'GH',
  status: 'ACTIVE',
  roles: ['ADMIN'],
  mfaEnabled: false,
  emailVerified: true,
  phoneVerified: false,
  lastLoginAt: '2026-09-04T08:00:00.000Z',
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

async function clickResponsiveLogout(page: Page) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 700) {
    await page.getByRole('button', { name: 'More admin navigation' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Log out' }).click();
  } else {
    await page.getByRole('button', { name: 'Log out' }).click();
  }
}

test.describe('Sprint 49 browser session security — Admin', () => {
  test('cookie session restore authenticates Admin with an access-only browser response', async ({ page }) => {
    let refreshCalls = 0;

    await silenceFavicon(page);
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      if (path === 'auth/refresh') {
        refreshCalls += 1;
        return route.fulfill(json(200, { accessToken: 'admin-access-only' }));
      }
      if (path === 'auth/me') {
        return route.fulfill(json(200, ADMIN_USER));
      }
      return route.fulfill(json(200, {}));
    });

    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeVisible();
    await expect(
      page.locator('main.content').getByText('admin-browser-session@example.com', { exact: true }),
    ).toBeVisible();
    expect(refreshCalls).toBe(1);

    const storage = await page.evaluate(() => `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`);
    expect(storage).not.toContain('refreshToken');
    expect(storage).not.toContain('admin-access-only');
  });

  test('logout recovers from stale Admin bearer and a reload cannot silently restore the browser session', async ({ page }) => {
    let refreshCalls = 0;
    let logoutCalls = 0;
    let browserSessionClears = 0;
    const logoutAuthorizations: Array<string | null> = [];

    await silenceFavicon(page);
    await page.route('**/api/v1/**', async (route) => {
      const path = apiPath(route);
      const request = route.request();

      if (path === 'auth/refresh') {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          return route.fulfill(json(200, { accessToken: 'stale-admin-access' }));
        }
        if (refreshCalls === 2) {
          return route.fulfill(json(200, { accessToken: 'fresh-admin-access' }));
        }
        return route.fulfill(json(401, { statusCode: 401, message: 'Unauthorized' }));
      }

      if (path === 'auth/me') {
        return route.fulfill(json(200, ADMIN_USER));
      }

      if (path === 'auth/logout') {
        logoutCalls += 1;
        logoutAuthorizations.push(request.headers()['authorization'] ?? null);
        if (logoutCalls === 1) {
          return route.fulfill(json(401, { statusCode: 401, message: 'Unauthorized' }));
        }
        return route.fulfill(json(200, { message: 'Logged out successfully' }));
      }

      if (path === 'auth/browser-session' && request.method() === 'DELETE') {
        browserSessionClears += 1;
        return route.fulfill({ status: 204, body: '' });
      }

      return route.fulfill(json(200, {}));
    });

    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeVisible();

    await clickResponsiveLogout(page);

    await expect(page.getByText('Not signed in')).toBeVisible();
    expect(refreshCalls).toBe(2);
    expect(logoutCalls).toBe(2);
    expect(logoutAuthorizations).toEqual([
      'Bearer stale-admin-access',
      'Bearer fresh-admin-access',
    ]);
    expect(browserSessionClears).toBe(1);

    const storage = await page.evaluate(() => `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`);
    expect(storage).not.toContain('stale-admin-access');
    expect(storage).not.toContain('fresh-admin-access');

    await page.reload();
    await expect(page.getByText('Not signed in')).toBeVisible();
    expect(refreshCalls).toBe(3);
    expect(logoutCalls).toBe(2);
  });
});
