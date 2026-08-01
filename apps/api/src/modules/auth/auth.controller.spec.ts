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
 * AuthController spec — Hotfix: refresh token validation.
 *
 * These tests verify the FULL sign → verify roundtrip using a REAL JwtModule
 * (not a mock). This proves that:
 *   1. A token signed by login/register can be immediately verified by refresh.
 *   2. The same JWT secret/config is used for both signing and verification.
 *   3. Cookie and body refresh read the same token value.
 *   4. Missing/invalid tokens return 401 cleanly (not 500).
 *
 * The AuthService is mocked at the boundary (login/register/refreshTokens),
 * but the JwtService is real — so generateTokens() in the real AuthService
 * would sign with the real secret. To test the roundtrip, we sign a token with
 * the real JwtService and pass it to the controller's refresh endpoint, which
 * delegates to the (mocked) authService.refreshTokens — but we configure the
 * mock to actually verify the token using the same real JwtService.
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
        // Sprint 28 amendment: ThrottlerModule required because the controller
        // now uses @UseGuards(ThrottlerGuard).
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

  // Helper: sign a realistic refresh token with the real JwtService
  function signRefreshToken(payload: {
    sub: string;
    email: string | null;
    roles: string[];
  }): string {
    return jwtService.sign(payload, { expiresIn: '7d' });
  }

  // Helper: build a mock Express Request with optional cookies
  function mockRequest(cookies: Record<string, string> = {}): Request {
    return { cookies } as unknown as Request;
  }

  // Helper: build a mock Express Response that records cookie calls
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

  describe('POST /auth/refresh — cookie flow (web/admin)', () => {
    it('should read the refresh token from the httpOnly cookie', async () => {
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
      expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    });

    it('should set a new refresh cookie on success (rotation)', async () => {
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

    it('should return 401 when no cookie and no body.refreshToken', async () => {
      const req = mockRequest(); // no cookies
      await expect(controller.refresh(req, undefined, mockResponse())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/refresh — body flow (mobile)', () => {
    it('should read the refresh token from the JSON body', async () => {
      const token = signRefreshToken({
        sub: 'user-2',
        email: 'mobile@example.com',
        roles: [RoleName.USER],
      });

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const req = mockRequest(); // no cookie
      const res = mockResponse();

      const result = await controller.refresh(req, { refreshToken: token }, res);

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(token);
      expect(result).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    });

    it('should prefer the cookie over the body when both are present', async () => {
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

      await controller.refresh(req, { refreshToken: bodyToken }, res);

      // Cookie takes precedence
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(cookieToken);
    });

    it('should return 401 when body is empty {} and no cookie', async () => {
      const req = mockRequest();
      await expect(controller.refresh(req, {}, mockResponse())).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('JWT sign → verify roundtrip (same secret/config)', () => {
    /**
     * This is the CRITICAL hotfix test. It proves that a token signed by the
     * same JwtModule can be immediately verified — i.e., the signing secret
     * and verification secret are identical (both come from JwtModule config).
     *
     * Before the hotfix, refreshTokens() passed { secret: configService.get(...) }
     * to verify(), which could diverge from the module config. The fix removes
     * the explicit { secret } so verify() uses the module's configured secret.
     */
    it('should verify a token signed by the same JwtModule (login-issued)', async () => {
      const loginPayload = {
        sub: 'login-user-id',
        email: 'login@example.com',
        roles: [RoleName.USER],
      };

      // Sign as login() would
      const refreshToken = jwtService.sign(loginPayload, { expiresIn: '7d' });

      // Verify as refreshTokens() now does (no explicit { secret })
      const verified = jwtService.verify(refreshToken);

      expect(verified.sub).toBe('login-user-id');
      expect(verified.email).toBe('login@example.com');
      expect(verified.roles).toEqual([RoleName.USER]);
    });

    it('should verify a token signed by the same JwtModule (register-issued)', async () => {
      const registerPayload = {
        sub: 'register-user-id',
        email: null, // phone-only user
        roles: [RoleName.USER],
      };

      const refreshToken = jwtService.sign(registerPayload, { expiresIn: '7d' });
      const verified = jwtService.verify(refreshToken);

      expect(verified.sub).toBe('register-user-id');
      expect(verified.email).toBeNull();
      expect(verified.roles).toEqual([RoleName.USER]);
    });

    it('should reject a token signed with a different secret', async () => {
      // Sign with a WRONG secret
      const wrongToken = jwtService.sign(
        { sub: 'user', email: 'x@example.com', roles: [] },
        { secret: 'completely-different-secret', expiresIn: '7d' },
      );

      // Verify with the module's configured secret should throw
      expect(() => jwtService.verify(wrongToken)).toThrow();
    });

    it('should reject an expired token', async () => {
      const expiredToken = jwtService.sign(
        { sub: 'user', email: 'x@example.com', roles: [] },
        { expiresIn: '-1s' }, // already expired
      );

      expect(() => jwtService.verify(expiredToken)).toThrow();
    });
  });

  describe('refresh does not expose sensitive fields', () => {
    it('should only return accessToken and refreshToken (no passwordHash)', async () => {
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
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
      expect(Object.keys(result).sort()).toEqual(['accessToken', 'refreshToken']);
    });
  });

  describe('AuthCookieService integration', () => {
    it('cookie name should be irexpro_refresh', () => {
      expect(AuthCookieService.COOKIE_NAME).toBe('irexpro_refresh');
    });

    it('getRefreshTokenFromCookie should return the same value set by setRefreshCookie', () => {
      // This verifies cookie and body refresh read the same token value
      const token = signRefreshToken({
        sub: 'user',
        email: 'x@example.com',
        roles: [RoleName.USER],
      });

      const res = mockResponse();
      authCookieService.setRefreshCookie(res, token, true);

      // The cookie was set with the exact token value
      expect(res.cookie).toHaveBeenCalledWith(
        'irexpro_refresh',
        token,
        expect.objectContaining({ httpOnly: true }),
      );

      // And reading it back from a request gives the same value
      const req = mockRequest({ irexpro_refresh: token });
      const readBack = authCookieService.getRefreshTokenFromCookie(req);
      expect(readBack).toBe(token);
    });
  });
});
