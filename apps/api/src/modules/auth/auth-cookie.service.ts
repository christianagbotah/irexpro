import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

/**
 * AuthCookieService — manages the httpOnly refresh-token cookie for web/admin
 * and enforces the trusted-origin boundary for cookie-backed browser sessions.
 *
 * Browser session model:
 *   - Web/admin: refresh token is HttpOnly-cookie-only; access token is held in
 *     memory. Production cookies use SameSite=None because the browser apps and
 *     API may live on separate trusted origins.
 *   - Mobile/native: refresh token stays in the JSON body and SecureStore. The
 *     native/body-token contract must not rely on or receive browser cookies.
 *
 * Origin policy:
 *   - Any request that consumes or mutates the browser refresh cookie must come
 *     from an exact configured app.corsOrigins origin when an Origin header is
 *     present.
 *   - Production fails closed when Origin is missing because SameSite=None
 *     permits ambient cross-site cookie delivery and CORS is not a CSRF guard.
 *   - Non-production allows a missing Origin so focused unit tests and trusted
 *     local non-browser tooling remain source-compatible, but an explicitly
 *     supplied untrusted/malformed Origin is always rejected.
 */
@Injectable()
export class AuthCookieService {
  static readonly COOKIE_NAME = 'irexpro_refresh';
  private static readonly UNTRUSTED_ORIGIN_MESSAGE = 'Untrusted browser request origin';

  constructor(private readonly configService: ConfigService) {}

  private isProduction(): boolean {
    return this.configService.get<string>('app.env', 'development') === 'production';
  }

  private getCookieOptions(rememberMe?: boolean) {
    const isProd = this.isProduction();
    // rememberMe controls cookie maxAge.
    //   - rememberMe = false (default): session cookie (cleared on browser close)
    //   - rememberMe = true: 7-day persistent cookie
    const maxAge = rememberMe ? 7 * 24 * 60 * 60 * 1000 : undefined;
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ('none' as const) : ('lax' as const),
      path: '/api/v1/auth',
      ...(maxAge !== undefined && { maxAge }),
    };
  }

  private normalizeOrigin(value: string): string | null {
    try {
      const url = new URL(value);
      if (url.origin === 'null') return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  private trustedOrigins(): Set<string> {
    const configured = this.configService.get<string[]>('app.corsOrigins', []);
    return new Set(
      configured
        .map((value) => this.normalizeOrigin(value.trim()))
        .filter((value): value is string => Boolean(value)),
    );
  }

  /**
   * Enforce request provenance before a request is allowed to establish,
   * consume, rotate, or clear the browser refresh cookie.
   */
  assertTrustedBrowserRequest(req: Request): void {
    const rawOrigin = req.headers?.origin;

    if (!rawOrigin) {
      if (this.isProduction()) {
        throw new ForbiddenException(AuthCookieService.UNTRUSTED_ORIGIN_MESSAGE);
      }
      return;
    }

    const normalized = this.normalizeOrigin(rawOrigin);
    if (!normalized || !this.trustedOrigins().has(normalized)) {
      throw new ForbiddenException(AuthCookieService.UNTRUSTED_ORIGIN_MESSAGE);
    }
  }

  /** Set the httpOnly refresh cookie on the response. */
  setRefreshCookie(res: Response, refreshToken: string, rememberMe?: boolean): void {
    res.cookie(AuthCookieService.COOKIE_NAME, refreshToken, this.getCookieOptions(rememberMe));
  }

  /** Clear the httpOnly refresh cookie on the response. */
  clearRefreshCookie(res: Response): void {
    res.clearCookie(AuthCookieService.COOKIE_NAME, this.getCookieOptions());
  }

  /** Read the refresh token from the request cookie (if present). */
  getRefreshTokenFromCookie(req: Request): string | undefined {
    return req.cookies?.[AuthCookieService.COOKIE_NAME];
  }
}
