import type { ApiClient } from '@irexpro/api-client';
import { createApiClient } from '@irexpro/api-client';
import { createBrowserAuthClient } from '@irexpro/api-client/browser-auth';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!baseUrl) {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_URL is not set. Copy apps/admin/.env.example to .env.local.',
  );
}

let cachedAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

export const api: ApiClient = createApiClient({
  baseUrl,
  includeCredentials: true,
  getAccessToken: () => cachedAccessToken,
});

export const browserAuth = createBrowserAuthClient(api);
