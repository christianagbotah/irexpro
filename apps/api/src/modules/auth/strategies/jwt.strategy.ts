import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../users/entities/user.entity';
import { AuthenticatedPrincipal } from '../../../common/interfaces/authenticated-principal.interface';

export interface JwtPayload {
  sub: string;
  email: string | null;
  roles: string[];
  /** Distinguishes bearer access JWTs from refresh JWTs. */
  tokenType?: 'access' | 'refresh';
  /** Server-side token generation used for immediate revocation. */
  sessionVersion?: number;
  /** Unique token id so each rotation produces a distinct JWT. */
  jti?: string;
  iat?: number;
  exp?: number;
}

/**
 * JwtStrategy — validates JWT access tokens and populates request.user.
 *
 * Sprint 48 adds two server-side security gates:
 *   1. refresh JWTs cannot be presented as bearer access tokens;
 *   2. the token's sessionVersion must match identity.users.session_version.
 *
 * Logout, password reset, and refresh rotation advance session_version, so
 * stale access tokens are rejected immediately rather than remaining valid
 * until their normal expiry.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    // New tokens are explicitly typed. A legacy token has no type, but will be
    // rejected after migration because it has version 0 while persisted users
    // begin at version 1.
    if (payload.tokenType && payload.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'phone', 'status', 'sessionVersion'],
    });

    if (
      !user ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.PERMANENTLY_LOCKED ||
      user.status === UserStatus.CLOSED
    ) {
      throw new UnauthorizedException('User account is not active');
    }

    const tokenVersion = Number.isInteger(payload.sessionVersion) ? payload.sessionVersion! : 0;
    const userVersion = Number.isInteger(user.sessionVersion) ? user.sessionVersion : 0;
    if (tokenVersion !== userVersion) {
      throw new UnauthorizedException('Session has been revoked');
    }

    return {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      roles: payload.roles ?? [],
      status: user.status,
    };
  }
}
