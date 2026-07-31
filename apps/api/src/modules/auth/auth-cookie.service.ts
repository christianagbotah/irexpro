import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

/**
 * AuthCookieService — manages the httpOnly refresh-token cookie for web/admin.
 *
 * Sprint 25 amendment: hybrid auth strategy.
 *   - Web/admin: the refresh token is stored in an httpOnly, secure cookie
 *     that JavaScript cannot read. The access token is held in memory by the
 *     frontend. On page refresh, the frontend calls /auth/refresh with
 *     credentials:'include' — the browser automatically sends the cookie.
 *   - Mobile: the refresh token is returned in the JSON body (as before) and
 *     persisted in Expo SecureStore. Mobile does not use cookies.
 *
 * Cookie settings:
 *   - httpOnly: true — JavaScript cannot access the cookie (XSS protection)
 *   - secure: true in production (HTTPS only); false in dev (HTTP localhost)
 *   - sameSite: 'none' in production (cross-origin admin → API), 'lax' in dev
 *   - path: '/api/v1/auth' — only sent to auth endpoints (refresh/logout)
 *   - maxAge: 7 days (matches JWT_REFRESH_EXPIRY default)
 *
 * The cookie is set on login and register, refreshed on /auth/refresh, and
 * cleared on /auth/logout.
 */
@Injectable()
export class AuthCookieService {
  static readonly COOKIE_NAME = 'irexpro_refresh';

  constructor(private readonly configService: ConfigService) {}

  private isProduction(): boolean {
    return this.configService.get<string>('app.env', 'development') === 'production';
  }

  private getCookieOptions() {
    const isProd = this.isProduction();
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ('none' as const) : ('lax' as const),
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days — matches JWT_REFRESH_EXPIRY default
    };
  }

  /** Set the httpOnly refresh cookie on the response. */
  setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(AuthCookieService.COOKIE_NAME, refreshToken, this.getCookieOptions());
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
