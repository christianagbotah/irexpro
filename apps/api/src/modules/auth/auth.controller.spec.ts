import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { PasswordResetService } from './password-reset.service';
import { RoleName } from '../users/entities/role.entity';

/**
 * AuthController spec — refresh token validation and browser confidentiality.
 *
 * These tests verify the FULL sign → verify roundtrip using a REAL JwtModule
 * (not a mock), plus the Sprint 49 browser contract:
 *   1. Cookie-sourced refresh tokens are never echoed into JSON responses.
 *   2. Browser login/register cookie transport exposes only accessToken.
 *   3. Mobile/body refresh preserves the full token-pair response.
 *   4. Missing/invalid tokens return 401 cleanly (not 500).
 */

const TEST_JWT_SECRET = 'test-jwt-secret-for-refresh-validation-hotfix-32chars!';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshTokens: jest.fn(),
  getAuthUserDto: jest.fn(),
};

const mockPasswordResetService = {
  requestReset: jest.fn().mockResolvedValue({ delivered: false, channel: null }),
  resetWithToken: jest.fn().mockResolvedValue(undefined),
  resetWithCode: jest.fn().mockResolvedValue(undefined),
};

describe('AuthController — refresh token validation (hotfix)', () => {
  let module: TestingModule;
  let controller: AuthController;
  let authCookieService: AuthCookieService;
  let jwtService: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              app: { env: 'test' },
              jwt: {
                secret: TEST_JWT_SECRET,
                accessExpiry: '15m',
                refreshExpiry: '7d',
              },
              cookie: { secret: 'test-cookie-secret-16ch' },
            }),
          ],
        }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [],
          useFactory: () => ({
            secret: TEST_JWT_SECRET,
            signOptions: { expiresIn: '15m' },
          }),
        }),
        ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }] }),
      ],
      controllers: [AuthController],
      providers: [
        AuthCookieService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: PasswordResetService, useValue: mockPasswordResetService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authCookieService = module.get<AuthCookieService>(AuthCookieService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(async () => {
    await module.close();
  });

  function signRefreshToken(payload: {
    sub: string;
    email: string | null;
    roles: string[];
  }): string {
    return jwtService.sign(payload, { expiresIn: '7d' });
  }

  function mockRequest(cookies: Record<string, string> = {}): Request {
    return { cookies } as unknown as Request;
  }

  function mockResponse(): Response & { _cookies: Record<string, unknown> } {
    const _cookies: Record<string, unknown> = {};
    const res = {
      cookie: jest.fn((name: string, value: string, opts: unknown) => {
        _cookies[name] = { value, opts };
      }),
      clearCookie: jest.fn(),
    };
    return Object.assign(res, { _cookies }) as unknown as Response & {
      _cookies: Record<string, unknown>;
    };
  }

  describe('browser login/register response transport', () => {
    it('returns accessToken only for browser login while setting the HttpOnly refresh cookie', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'browser-access',
        refreshToken: 'browser-refresh-secret',
      });
      const res = mockResponse();

      const result = await controller.login(
        { identifier: 'user@example.com', password: 'test-password' },
        mockRequest(),
        res,
        'cookie',
      );

      expect(result).toEqual({ accessToken: 'browser-access' });
      expect(JSON.stringify(result)).not.toContain('browser-refresh-secret');
      expect(res.cookie).toHaveBeenCalledWith(
        'irexpro_refresh',
        'browser-refresh-secret',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('returns accessToken only for browser registration while setting the HttpOnly refresh cookie', async () => {
      mockAuthService.register.mockResolvedValue({
        accessToken: 'browser-access',
        refreshToken: 'browser-register-refresh-secret',
      });
      const res = mockResponse();

      const result = await controller.register(
        { email: 'new@example.com', password: 'test-password' },
        mockRequest(),
        res,
        'cookie',
      );

      expect(result).toEqual({ accessToken: 'browser-access' });
      expect(JSON.stringify(result)).not.toContain('browser-register-refresh-secret');
      expect(res.cookie).toHaveBeenCalledWith(
        'irexpro_refresh',
        'browser-register-refresh-secret',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('keeps the legacy full-token login response when cookie transport is not requested', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'mobile-access',
        refreshToken: 'mobile-refresh',
      });

      const result = await controller.login(
        { identifier: 'mobile@example.com', password: 'test-password' },
        mockRequest(),
        mockResponse(),
      );

      expect(result).toEqual({ accessToken: 'mobile-access', refreshToken: 'mobile-refresh' });
    });
  });

  describe('POST /auth/refresh — cookie flow (web/admin)', () => {
    it('reads the refresh token from the HttpOnly cookie without echoing it to JavaScript', async () => {
      const token = signRefreshToken({
        sub: 'user-1',
        email: 'test@example.com',
        roles: [RoleName.USER],
      });

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const req = mockRequest({ irexpro_refresh: token });
      const res = mockResponse();

      const result = await controller.refresh(req, undefined, res);

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(token);
      expect(result).toEqual({ accessToken: 'new-access' });
      expect(JSON.stringify(result)).not.toContain('new-refresh');
    });

    it('sets a new refresh cookie on success (rotation)', async () => {
      const token = signRefreshToken({
        sub: 'user-1',
        email: 'test@example.com',
        roles: [RoleName.USER],
      });

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh-rotated',
      });

      const req = mockRequest({ irexpro_refresh: token });
      const res = mockResponse();

      await controller.refresh(req, undefined, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'irexpro_refresh',
        'new-refresh-rotated',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('returns 401 when no cookie and no body.refreshToken', async () => {
      const req = mockRequest();
      await expect(controller.refresh(req, undefined, mockResponse())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });

    it('idempotently clears the browser refresh cookie', () => {
      const res = mockResponse();
      controller.clearBrowserSession(res);
      expect(res.clearCookie).toHaveBeenCalledWith(
        'irexpro_refresh',
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });

  describe('POST /auth/refresh — body flow (mobile)', () => {
    it('reads the refresh token from the JSON body and returns the full token pair', async () => {
      const token = signRefreshToken({
        sub: 'user-2',
        email: 'mobile@example.com',
        roles: [RoleName.USER],
      });

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const req = mockRequest();
      const res = mockResponse();

      const result = await controller.refresh(req, { refreshToken: token }, res);

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(token);
      expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    });

    it('prefers the cookie over the body and therefore keeps the response browser-safe', async () => {
      const cookieToken = signRefreshToken({
        sub: 'user-cookie',
        email: 'cookie@example.com',
        roles: [RoleName.USER],
      });
      const bodyToken = signRefreshToken({
        sub: 'user-body',
        email: 'body@example.com',
        roles: [RoleName.USER],
      });

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const req = mockRequest({ irexpro_refresh: cookieToken });
      const res = mockResponse();

      const result = await controller.refresh(req, { refreshToken: bodyToken }, res);

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(cookieToken);
      expect(result).toEqual({ accessToken: 'new-access' });
    });

    it('returns 401 when body is empty {} and no cookie', async () => {
      const req = mockRequest();
      await expect(controller.refresh(req, {}, mockResponse())).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('JWT sign → verify roundtrip (same secret/config)', () => {
    it('verifies a token signed by the same JwtModule (login-issued)', async () => {
      const loginPayload = {
        sub: 'login-user-id',
        email: 'login@example.com',
        roles: [RoleName.USER],
      };

      const refreshToken = jwtService.sign(loginPayload, { expiresIn: '7d' });
      const verified = jwtService.verify(refreshToken);

      expect(verified.sub).toBe('login-user-id');
      expect(verified.email).toBe('login@example.com');
      expect(verified.roles).toEqual([RoleName.USER]);
    });

    it('verifies a token signed by the same JwtModule (register-issued)', async () => {
      const registerPayload = {
        sub: 'register-user-id',
        email: null,
        roles: [RoleName.USER],
      };

      const refreshToken = jwtService.sign(registerPayload, { expiresIn: '7d' });
      const verified = jwtService.verify(refreshToken);

      expect(verified.sub).toBe('register-user-id');
      expect(verified.email).toBeNull();
      expect(verified.roles).toEqual([RoleName.USER]);
    });

    it('rejects a token signed with a different secret', async () => {
      const wrongToken = jwtService.sign(
        { sub: 'user', email: 'x@example.com', roles: [] },
        { secret: 'completely-different-secret', expiresIn: '7d' },
      );

      expect(() => jwtService.verify(wrongToken)).toThrow();
    });

    it('rejects an expired token', async () => {
      const expiredToken = jwtService.sign(
        { sub: 'user', email: 'x@example.com', roles: [] },
        { expiresIn: '-1s' },
      );

      expect(() => jwtService.verify(expiredToken)).toThrow();
    });
  });

  describe('refresh response hygiene', () => {
    it('cookie flow returns only accessToken and excludes sensitive fields', async () => {
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh-secret',
      });

      const token = signRefreshToken({
        sub: 'user',
        email: 'x@example.com',
        roles: [RoleName.USER],
      });
      const req = mockRequest({ irexpro_refresh: token });
      const res = mockResponse();

      const result = await controller.refresh(req, undefined, res);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('mfaSecret');
      expect(serialized).not.toContain('refresh-secret');
      expect(Object.keys(result)).toEqual(['accessToken']);
    });
  });

  describe('AuthCookieService integration', () => {
    it('cookie name should be irexpro_refresh', () => {
      expect(AuthCookieService.COOKIE_NAME).toBe('irexpro_refresh');
    });

    it('getRefreshTokenFromCookie should return the same value set by setRefreshCookie', () => {
      const token = signRefreshToken({
        sub: 'user',
        email: 'x@example.com',
        roles: [RoleName.USER],
      });

      const res = mockResponse();
      authCookieService.setRefreshCookie(res, token, true);

      expect(res.cookie).toHaveBeenCalledWith(
        'irexpro_refresh',
        token,
        expect.objectContaining({ httpOnly: true }),
      );

      const req = mockRequest({ irexpro_refresh: token });
      const readBack = authCookieService.getRefreshTokenFromCookie(req);
      expect(readBack).toBe(token);
    });
  });
});
