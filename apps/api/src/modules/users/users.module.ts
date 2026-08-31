import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UserRole } from './entities/user-role.entity';
import { Role } from './entities/role.entity';
import { UserPaymentProfile } from './entities/user-payment-profile.entity';
import { AccountAppeal } from './entities/account-appeal.entity';
import { RiskProfile } from '../risk/entities/risk-profile.entity';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { OnboardingService } from './onboarding.service';
import { AuditModule } from '../audit/audit.module';
import { AccountGovernanceController } from './account-governance.controller';
import { AccountGovernanceService } from './account-governance.service';

@Module({
  // Sprint 29: OnboardingService needs RiskProfile + BrokerConnection repos.
  // AuditModule is imported for audit logging in the onboarding status check.
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserProfile,
      UserRole,
      Role,
      UserPaymentProfile,
      AccountAppeal,
      RiskProfile,
      BrokerConnection,
    ]),
    AuditModule,
    // The public appeal endpoint is deliberately rate limited. Keep this
    // module-local configuration aligned with auth's general API throttling.
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
  ],
  controllers: [UsersController, AccountGovernanceController],
  providers: [UsersService, BootstrapAdminService, OnboardingService, AccountGovernanceService],
  exports: [UsersService, BootstrapAdminService, OnboardingService, TypeOrmModule],
})
export class UsersModule {}
