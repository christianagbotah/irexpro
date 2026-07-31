import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../users/entities/user.entity';

export interface JwtPayload {
  sub: string;
  email: string | null;
  roles: string[];
  iat?: number;
  exp?: number;
}

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

  async validate(payload: JwtPayload): Promise<User & { roles: string[] }> {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: ['userRoles', 'userRoles.role'],
    });

    if (!user || user.status === UserStatus.SUSPENDED || user.status === UserStatus.CLOSED) {
      throw new UnauthorizedException('User account is not active');
    }

    return { ...user, roles: payload.roles };
  }
}
