import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';

/**
 * Sprint 48 HTTP-level authentication throttle verification.
 *
 * These are real Nest HTTP requests through ThrottlerGuard. They intentionally
 * assert the first request above each configured ceiling receives HTTP 429,
 * rather than merely checking decorator metadata.
 */
describe('AuthController rate limits (HTTP)', () => {
  let app: INestApplication;

  const authService = {
    register: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    login: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    refreshTokens: jest
      .fn()
      .mockResolvedValue({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }),
    logout: jest.fn(),
    getAuthUserDto: jest.fn(),
  };

  const authCookieService = {
    getRefreshTokenFromCookie: jest.fn().mockReturnValue(null),
    setRefreshCookie: jest.fn(),
    clearRefreshCookie: jest.fn(),
  };

  const passwordResetService = {
    requestReset: jest.fn().mockResolvedValue({ delivered: false, channel: null }),
    resetWithToken: jest.fn().mockResolvedValue(undefined),
    resetWithCode: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AuthCookieService, useValue: authCookieService },
        { provide: PasswordResetService, useValue: passwordResetService },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function expectAllowedThenThrottled(
    path: string,
    body: Record<string, unknown>,
    limit: number,
    allowedStatus: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < limit; attempt += 1) {
      await request(app.getHttpServer()).post(path).send(body).expect(allowedStatus);
    }
    await request(app.getHttpServer()).post(path).send(body).expect(429);
  }

  it('limits registration to 10 requests per 15 minutes per IP', async () => {
    await expectAllowedThenThrottled(
      '/auth/register',
      { email: 'new@example.com', password: 'SecureP@ssw0rd!' },
      10,
      201,
    );
    expect(authService.register).toHaveBeenCalledTimes(10);
  });

  it('limits login to 10 requests per minute per IP', async () => {
    await expectAllowedThenThrottled(
      '/auth/login',
      { identifier: 'user@example.com', password: 'SecureP@ssw0rd!' },
      10,
      200,
    );
    expect(authService.login).toHaveBeenCalledTimes(10);
  });

  it('limits refresh to 60 requests per minute per IP', async () => {
    await expectAllowedThenThrottled(
      '/auth/refresh',
      { refreshToken: 'opaque-refresh-token' },
      60,
      200,
    );
    expect(authService.refreshTokens).toHaveBeenCalledTimes(60);
  });

  it('limits forgot-password to 5 requests per 15 minutes per IP', async () => {
    await expectAllowedThenThrottled(
      '/auth/forgot-password',
      { identifier: 'user@example.com' },
      5,
      200,
    );
    expect(passwordResetService.requestReset).toHaveBeenCalledTimes(5);
  });

  it('limits reset-password to 10 requests per 15 minutes per IP', async () => {
    await expectAllowedThenThrottled(
      '/auth/reset-password',
      { token: 'opaque-reset-token', password: 'NewSecureP@ssw0rd!' },
      10,
      200,
    );
    expect(passwordResetService.resetWithToken).toHaveBeenCalledTimes(10);
  });
});
