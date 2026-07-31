import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { AuthCookieService } from './auth-cookie.service';

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'app.env') return 'test';
    return def;
  }),
};

describe('AuthCookieService (Sprint 25 — hybrid httpOnly cookie)', () => {
  let service: AuthCookieService;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [
        AuthCookieService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    service = module.get<AuthCookieService>(AuthCookieService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('setRefreshCookie', () => {
    it('should set an httpOnly cookie with the refresh token', () => {
      const res = { cookie: jest.fn() } as unknown as Response;
      // Sprint 27: without rememberMe, cookie is a session cookie (no maxAge)
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
