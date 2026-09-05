import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDatabaseSslOptions } from './database-tls';

describe('database TLS policy', () => {
  it('keeps TLS disabled when DB_SSL is disabled', () => {
    expect(getDatabaseSslOptions(false)).toBe(false);
    expect(getDatabaseSslOptions(undefined)).toBe(false);
  });

  it('requires certificate verification whenever DB_SSL is enabled', () => {
    expect(getDatabaseSslOptions(true)).toEqual({ rejectUnauthorized: true });
  });

  it('wires TypeORM through the verified TLS policy without an insecure override', () => {
    const source = readFileSync(resolve(__dirname, '../app.module.ts'), 'utf8');

    expect(source).toContain(
      "ssl: getDatabaseSslOptions(configService.get<boolean>('database.ssl'))",
    );
    expect(source).not.toContain('rejectUnauthorized: false');
  });
});
