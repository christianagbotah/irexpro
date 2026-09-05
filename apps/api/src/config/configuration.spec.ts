import configuration from './configuration';

describe('root configuration — CORS origins', () => {
  const originalCorsOrigins = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (originalCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = originalCorsOrigins;
    }
  });

  it('exposes the canonical origin list consumed by Nest CORS and auth cookie provenance', () => {
    process.env.CORS_ORIGINS =
      ' https://irexpro.lightworldtech.com/ , https://admin.irexpro.lightworldtech.com ';

    expect(configuration().app.corsOrigins).toEqual([
      'https://irexpro.lightworldtech.com',
      'https://admin.irexpro.lightworldtech.com',
    ]);
  });

  it('fails root configuration loading when CORS_ORIGINS is not an origin-only allowlist', () => {
    process.env.CORS_ORIGINS = 'https://irexpro.lightworldtech.com/path';

    expect(() => configuration()).toThrow('Invalid CORS_ORIGINS entry at position 1');
  });
});
