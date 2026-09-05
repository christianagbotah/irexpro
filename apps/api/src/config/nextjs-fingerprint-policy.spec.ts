import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Next.js public framework fingerprint policy', () => {
  const repositoryRoot = resolve(__dirname, '../../../..');
  const configs = ['apps/web/next.config.mjs', 'apps/admin/next.config.mjs'];

  for (const relativePath of configs) {
    it(`${relativePath} disables the powered-by header`, () => {
      const source = readFileSync(resolve(repositoryRoot, relativePath), 'utf8');

      expect(source).toMatch(/\bpoweredByHeader:\s*false\b/);
    });
  }
});
