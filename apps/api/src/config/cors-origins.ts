const DEFAULT_CORS_ORIGIN = 'http://localhost:3001';

function invalidCorsOrigin(position: number): Error {
  return new Error(`Invalid CORS_ORIGINS entry at position ${position}`);
}

/**
 * Convert the comma-separated CORS_ORIGINS environment value into one
 * canonical allowlist shared by Nest CORS and browser-cookie provenance checks.
 *
 * Only HTTP(S) origins are valid. Paths, query strings, fragments, credentials,
 * wildcard hosts, opaque origins, and empty entries fail closed so runtime
 * security policy cannot drift because of permissive configuration parsing.
 */
export function parseCorsOrigins(value?: string): string[] {
  const configured = value ?? DEFAULT_CORS_ORIGIN;
  const canonicalOrigins: string[] = [];

  for (const [index, rawEntry] of configured.split(',').entries()) {
    const position = index + 1;
    const entry = rawEntry.trim();

    if (!entry) {
      throw invalidCorsOrigin(position);
    }

    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw invalidCorsOrigin(position);
    }

    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const hasOnlyOriginPath = url.pathname === '/' && !url.search && !url.hash;
    const hasCredentials = Boolean(url.username || url.password);
    const hasWildcardHost = url.hostname.includes('*');

    if (
      !isHttp ||
      url.origin === 'null' ||
      !hasOnlyOriginPath ||
      hasCredentials ||
      hasWildcardHost
    ) {
      throw invalidCorsOrigin(position);
    }

    if (!canonicalOrigins.includes(url.origin)) {
      canonicalOrigins.push(url.origin);
    }
  }

  return canonicalOrigins;
}
