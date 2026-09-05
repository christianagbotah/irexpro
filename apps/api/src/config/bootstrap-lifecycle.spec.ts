import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('API bootstrap lifecycle wiring', () => {
  const source = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf8');

  it('enables Nest shutdown hooks before opening the listener', () => {
    const shutdownHooks = source.indexOf('app.enableShutdownHooks();');
    const listen = source.indexOf('await app.listen(port, host);');

    expect(shutdownHooks).toBeGreaterThan(-1);
    expect(listen).toBeGreaterThan(shutdownHooks);
  });

  it('handles bootstrap rejection explicitly without abrupt process exit', () => {
    expect(source).toContain('void bootstrap().catch(() => {');
    expect(source).toContain('handleBootstrapFailure(bootstrapLogger);');
    expect(source).not.toContain('process.exit(1)');
  });
});
