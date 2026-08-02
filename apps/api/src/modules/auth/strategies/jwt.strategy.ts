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
  iat?: number;
  exp?: number;
}

/**
 * JwtStrategy — validates JWT access tokens and populates request.user.
 *
 * Hotfix: validate() now returns a SANITIZED AuthenticatedPrincipal containing
 * ONLY { userId, email, phone, roles, status }. It does NOT return the full
 * User entity. This prevents:
 *   - passwordHash, mfaSecret, userRoles entities from being in request.user
 *   - Controllers accidentally passing the full object to services expecting
 *     a UUID string (which caused QueryFailedError: invalid input syntax for
 *     type uuid)
 *
 * The principal is validated against the DB on every request (user must exist
 * and not be SUSPENDED/CLOSED). The roles come from the JWT payload (set at
 * token-sign time), not re-queried — this is the existing behavior and keeps
 * token revocation simple (short access token expiry).
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

    // Load the user to verify they still exist and are active.
    // We select ONLY safe fields — never passwordHash or mfaSecret.
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'phone', 'status'],
    });

    if (!user || user.status === UserStatus.SUSPENDED || user.status === UserStatus.CLOSED) {
      throw new UnauthorizedException('User account is not active');
    }

    // Return the sanitized principal — no secrets, no entity relations.
    return {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      roles: payload.roles ?? [],
      status: user.status,
    };
  }
}
