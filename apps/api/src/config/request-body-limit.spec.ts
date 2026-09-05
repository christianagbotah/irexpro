import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('API request-body limit wiring', () => {
  const source = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf8');

  it('keeps raw-body support while explicitly bounding parsed request bodies', () => {
    expect(source).toContain('rawBody: true');
    expect(source).toContain("app.useBodyParser('json', { limit: '100kb' });");
    expect(source).toContain("app.useBodyParser('urlencoded', { limit: '100kb' });");
  });

  it('registers the body limit before the public listener opens', () => {
    const jsonLimit = source.indexOf("app.useBodyParser('json', { limit: '100kb' });");
    const urlencodedLimit = source.indexOf("app.useBodyParser('urlencoded', { limit: '100kb' });");
    const listen = source.indexOf('await app.listen(port, host);');

    expect(jsonLimit).toBeGreaterThan(-1);
    expect(urlencodedLimit).toBeGreaterThan(jsonLimit);
    expect(listen).toBeGreaterThan(urlencodedLimit);
  });
});
