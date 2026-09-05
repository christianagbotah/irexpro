import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { AuthCookieService } from './auth-cookie.service';

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'app.env') return 'test';
    if (key === 'app.corsOrigins') return ['http://localhost:3001'];
    return def;
  }),
};

describe('AuthCookieService (hybrid httpOnly cookie)', () => {
  let service: AuthCookieService;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'app.env') return 'test';
      if (key === 'app.corsOrigins') return ['http://localhost:3001'];
      return def;
    });

    module = await Test.createTestingModule({
      providers: [AuthCookieService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();
    service = module.get<AuthCookieService>(AuthCookieService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('setRefreshCookie', () => {
    it('should set an httpOnly cookie with the refresh token', () => {
      const res = { cookie: jest.fn() } as unknown as Response;
      service.setRefreshCookie(res, 'test-refresh-token');

      expect(res.cookie).toHaveBeenCalledWith(
        AuthCookieService.COOKIE_NAME,
        'test-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          path: '/api/v1/auth',
        }),
      );
    });

    it('should set maxAge=7d when rememberMe is true', () => {
      const res = { cookie: jest.fn() } as unknown as Response;
      service.setRefreshCookie(res, 'token', true);

      expect(res.cookie).toHaveBeenCalledWith(
        AuthCookieService.COOKIE_NAME,
        'token',
        expect.objectContaining({
          httpOnly: true,
          maxAge: 7 * 24 * 60 * 60 * 1000,
        }),
      );
    });

    it('should NOT set maxAge when rememberMe is false (session cookie)', () => {
      const res = { cookie: jest.fn() } as unknown as Response;
      service.setRefreshCookie(res, 'token', false);

      const callArgs = (res.cookie as jest.Mock).mock.calls[0];
      const options = callArgs[2];
      expect(options.maxAge).toBeUndefined();
    });

    it('should set secure=true and sameSite=none in production', () => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
        if (key === 'app.env') return 'production';
        if (key === 'app.corsOrigins') return ['https://irexpro.lightworldtech.com'];
        return def;
      });

      const res = { cookie: jest.fn() } as unknown as Response;
      service.setRefreshCookie(res, 'token');

      expect(res.cookie).toHaveBeenCalledWith(
        AuthCookieService.COOKIE_NAME,
        'token',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'none',
        }),
      );
    });

    it('should set secure=false and sameSite=lax in development', () => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
        if (key === 'app.env') return 'development';
        if (key === 'app.corsOrigins') return ['http://localhost:3001'];
        return def;
      });

      const res = { cookie: jest.fn() } as unknown as Response;
      service.setRefreshCookie(res, 'token');

      expect(res.cookie).toHaveBeenCalledWith(
        AuthCookieService.COOKIE_NAME,
        'token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
        }),
      );
    });
  });

  describe('trusted browser origin policy', () => {
    const trustedOrigins = [
      'https://irexpro.lightworldtech.com',
      'https://admin.irexpro.lightworldtech.com',
    ];

    function configure(env: string, origins: string[] = trustedOrigins) {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
        if (key === 'app.env') return env;
        if (key === 'app.corsOrigins') return origins;
        return def;
      });
    }

    function request(origin?: string): Request {
      return {
        headers: origin ? { origin } : {},
        cookies: {},
      } as unknown as Request;
    }

    it.each(trustedOrigins)('accepts configured trusted origin %s', (origin) => {
      configure('production');
      expect(() => service.assertTrustedBrowserRequest(request(origin))).not.toThrow();
    });

    it('normalizes a configured origin with a trailing slash before exact comparison', () => {
      configure('production', ['https://irexpro.lightworldtech.com/']);
      expect(() =>
        service.assertTrustedBrowserRequest(request('https://irexpro.lightworldtech.com')),
      ).not.toThrow();
    });

    it('rejects an untrusted origin even outside production', () => {
      configure('test');
      expect(() => service.assertTrustedBrowserRequest(request('https://attacker.example'))).toThrow(
        ForbiddenException,
      );
    });

    it('rejects origin-suffix confusion', () => {
      configure('production');
      expect(() =>
        service.assertTrustedBrowserRequest(
          request('https://irexpro.lightworldtech.com.attacker.example'),
        ),
      ).toThrow(ForbiddenException);
    });

    it.each(['null', 'not a url', '://broken'])('rejects malformed/unusable origin %s', (origin) => {
      configure('production');
      expect(() => service.assertTrustedBrowserRequest(request(origin))).toThrow(ForbiddenException);
    });

    it('fails closed when production browser provenance is missing', () => {
      configure('production');
      expect(() => service.assertTrustedBrowserRequest(request())).toThrow(ForbiddenException);
    });

    it('allows a missing Origin only outside production for local/test compatibility', () => {
      configure('test');
      expect(() => service.assertTrustedBrowserRequest(request())).not.toThrow();
    });

    it('fails closed in production when no trusted origins are configured', () => {
      configure('production', []);
      expect(() =>
        service.assertTrustedBrowserRequest(request('https://irexpro.lightworldtech.com')),
      ).toThrow(ForbiddenException);
    });
  });

  describe('clearRefreshCookie', () => {
    it('should clear the httpOnly cookie', () => {
      const res = { clearCookie: jest.fn() } as unknown as Response;
      service.clearRefreshCookie(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        AuthCookieService.COOKIE_NAME,
        expect.objectContaining({
          httpOnly: true,
          path: '/api/v1/auth',
        }),
      );
    });
  });

  describe('getRefreshTokenFromCookie', () => {
    it('should return the refresh token from the cookie', () => {
      const req = {
        cookies: { [AuthCookieService.COOKIE_NAME]: 'cookie-refresh-token' },
      } as unknown as Request;

      const token = service.getRefreshTokenFromCookie(req);
      expect(token).toBe('cookie-refresh-token');
    });

    it('should return undefined if the cookie is not present', () => {
      const req = { cookies: {} } as unknown as Request;
      const token = service.getRefreshTokenFromCookie(req);
      expect(token).toBeUndefined();
    });

    it('should return undefined if cookies is undefined', () => {
      const req = {} as unknown as Request;
      const token = service.getRefreshTokenFromCookie(req);
      expect(token).toBeUndefined();
    });
  });

  describe('cookie name', () => {
    it('should use the expected cookie name', () => {
      expect(AuthCookieService.COOKIE_NAME).toBe('irexpro_refresh');
    });
  });
});
