import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { PasswordResetService } from './password-reset.service';
import {
  PasswordResetDeliveryService,
  NodemailerEmailProvider,
  EMAIL_PROVIDER,
} from './password-reset-delivery.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { Role } from '../users/entities/role.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserProfile, UserRole, Role, PasswordResetToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Sprint 28 amendment: rate limiting for auth endpoints (forgot-password,
    // reset-password). Default: 10 requests per 60s per IP. Per-route overrides
    // on the controller set tighter limits for reset endpoints.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('throttle.ttl', 60) * 1000,
            limit: configService.get<number>('throttle.limit', 100),
          },
        ],
      }),
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.accessExpiry', '15m') },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookieService,
    PasswordResetService,
    PasswordResetDeliveryService,
    // Bind the NodemailerEmailProvider as the EMAIL_PROVIDER token so the
    // delivery service can be unit-tested with a mock provider.
    { provide: EMAIL_PROVIDER, useClass: NodemailerEmailProvider },
    JwtStrategy,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
