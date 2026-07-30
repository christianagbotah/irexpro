import type { ApiClient } from '@irexpro/api-client';
import { createApiClient } from '@irexpro/api-client';

/**
 * Shared API client for the web app.
 *
 * Reads NEXT_PUBLIC_API_BASE_URL from env — NEVER hardcodes localhost or a
 * domain. If the env var is missing, this throws at module load so the misconfig
 * is caught immediately rather than producing silent wrong-URL calls.
 *
 * credentials: 'include' is set so the httpOnly refresh-token cookie (set by the
 * backend) is sent with every request. The access token is attached via the
 * Authorization header by the getAccessToken getter (which reads from a secure,
 * non-localStorage location — see docs/integration).
 */
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!baseUrl) {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_URL is not set. Copy apps/web/.env.example to .env.local.',
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
