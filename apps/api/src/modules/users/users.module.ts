import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UserRole } from './entities/user-role.entity';
import { Role } from './entities/role.entity';
import { UserPaymentProfile } from './entities/user-payment-profile.entity';
import { RiskProfile } from '../risk/entities/risk-profile.entity';
import { BrokerConnection } from '../broker/entities/broker-connection.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { OnboardingService } from './onboarding.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  // Sprint 29: OnboardingService needs RiskProfile + BrokerConnection repos.
  // AuditModule is imported for audit logging in the onboarding status check.
  imports: [
    TypeOrmModule.forFeature([User, UserProfile, UserRole, Role, UserPaymentProfile, RiskProfile, BrokerConnection]),
    AuditModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, BootstrapAdminService, OnboardingService],
  exports: [UsersService, BootstrapAdminService, OnboardingService, TypeOrmModule],
})
export class UsersModule {}
