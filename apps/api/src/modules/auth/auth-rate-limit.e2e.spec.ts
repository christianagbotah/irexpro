import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
// Supertest exposes a CommonJS callable in this Jest/CommonJS API package.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserStatus } from '../users/entities/user.entity';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { PasswordResetService } from './password-reset.service';
import { VerificationService } from './verification.service';

/**
 * Sprint 48 HTTP-level authentication throttle verification.
 *
 * These are real Nest HTTP requests through ThrottlerGuard. Authenticated
 * routes override only JwtAuthGuard with a deterministic principal; the
 * throttling guard remains real and must return HTTP 429 at each boundary.
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

  const mfaService = {
    beginSetup: jest.fn().mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/iRexPro%3Auser?secret=JBSWY3DPEHPK3PXP',
    }),
    enable: jest.fn().mockResolvedValue(undefined),
    disable: jest.fn().mockResolvedValue(undefined),
  };

  const verificationService = {
    requestEmailVerification: jest.fn().mockResolvedValue(undefined),
    verifyEmail: jest.fn().mockResolvedValue(undefined),
  };

  const jwtGuard = {
    canActivate(context: ExecutionContext): boolean {
      context.switchToHttp().getRequest().user = {
        userId: '11111111-1111-4111-8111-111111111111',
        email: 'user@example.com',
        phone: null,
        roles: [],
        status: UserStatus.ACTIVE,
      };
      return true;
    },
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
        { provide: MfaService, useValue: mfaService },
        { provide: VerificationService, useValue: verificationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuard)
      .compile();

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

  it('limits login, including MFA challenges, to 10 requests per minute per IP', async () => {
    await expectAllowedThenThrottled(
      '/auth/login',
      { identifier: 'user@example.com', password: 'SecureP@ssw0rd!', mfaCode: '123456' },
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

  it('limits MFA setup to 5 requests per 15 minutes per IP', async () => {
    await expectAllowedThenThrottled('/auth/mfa/setup', {}, 5, 200);
    expect(mfaService.beginSetup).toHaveBeenCalledTimes(5);
  });

  it('limits MFA enable challenges to 10 requests per 15 minutes per IP', async () => {
    await expectAllowedThenThrottled('/auth/mfa/enable', { code: '123456' }, 10, 200);
    expect(mfaService.enable).toHaveBeenCalledTimes(10);
  });

  it('limits MFA disable challenges to 5 requests per 15 minutes per IP', async () => {
    await expectAllowedThenThrottled(
      '/auth/mfa/disable',
      { code: '123456', password: 'SecureP@ssw0rd!' },
      5,
      200,
    );
    expect(mfaService.disable).toHaveBeenCalledTimes(5);
  });

  it('limits email verification requests to 5 requests per 15 minutes per IP', async () => {
    await expectAllowedThenThrottled('/auth/verification/email/request', {}, 5, 200);
    expect(verificationService.requestEmailVerification).toHaveBeenCalledTimes(5);
  });

  it('limits email verification confirmation to 10 requests per 15 minutes per IP', async () => {
    await expectAllowedThenThrottled(
      '/auth/verification/email/confirm',
      { token: 'a'.repeat(43) },
      10,
      200,
    );
    expect(verificationService.verifyEmail).toHaveBeenCalledTimes(10);
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
