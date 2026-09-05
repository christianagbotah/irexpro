import configuration from './configuration';

describe('root configuration', () => {
  const originalCorsOrigins = process.env.CORS_ORIGINS;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppHost = process.env.APP_HOST;

  function restoreEnv(name: 'CORS_ORIGINS' | 'NODE_ENV' | 'APP_HOST', value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  afterEach(() => {
    restoreEnv('CORS_ORIGINS', originalCorsOrigins);
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('APP_HOST', originalAppHost);
  });

  describe('CORS origins', () => {
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

  describe('API listen host', () => {
    it('defaults production to loopback when APP_HOST is absent', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.APP_HOST;

      expect(configuration().app.host).toBe('127.0.0.1');
    });

    it('preserves the Docker/local all-interface default outside production', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.APP_HOST;

      expect(configuration().app.host).toBe('0.0.0.0');
    });

    it('honors an explicit operator-supplied production host', () => {
      process.env.NODE_ENV = 'production';
      process.env.APP_HOST = '10.20.30.40';

      expect(configuration().app.host).toBe('10.20.30.40');
    });
  });
});
