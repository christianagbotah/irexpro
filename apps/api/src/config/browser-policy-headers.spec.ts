import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSP = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'";
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=()';

function readNextConfig(app: 'web' | 'admin'): string {
  return readFileSync(resolve(__dirname, `../../../${app}/next.config.mjs`), 'utf8');
}

describe('public browser security header policy', () => {
  it.each(['web', 'admin'] as const)(
    '%s emits the conservative CSP and Permissions-Policy on every route',
    (app) => {
      const source = readNextConfig(app);

      expect(source).toContain("key: 'Content-Security-Policy'");
      expect(source).toContain(`value: \"${CSP}\"`);
      expect(source).toContain("key: 'Permissions-Policy'");
      expect(source).toContain(`value: '${PERMISSIONS_POLICY}'`);
      expect(source).toContain("source: '/:path*'");
    },
  );

  it.each(['web', 'admin'] as const)(
    '%s does not silently introduce resource-loading CSP restrictions in this slice',
    (app) => {
      const source = readNextConfig(app);

      expect(source).not.toMatch(/\bdefault-src\b/);
      expect(source).not.toMatch(/\bscript-src\b/);
      expect(source).not.toMatch(/\bstyle-src\b/);
      expect(source).not.toMatch(/\bconnect-src\b/);
    },
  );
});
