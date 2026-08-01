import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from './entities/user.entity';
import { RoleName } from './entities/role.entity';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly onboardingService: OnboardingService,
    private readonly auditService: AuditService,
  ) {}

  @Get('users/me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser() user: User) {
    return this.usersService.findById(user.id);
  }

  /**
   * Sprint 29: update the current user's profile for onboarding.
   * Uses a proper DTO with validation (no more raw Record<string, unknown>).
   * Updates BOTH User-level fields (countryCode, timezone, preferredCurrency)
   * AND UserProfile fields (firstName, lastName, tradingExperienceLevel).
   * Audits ONBOARDING_PROFILE_UPDATED.
   */
  @Patch('users/me')
  @ApiOperation({ summary: 'Update current user profile (onboarding)' })
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateMyProfileDto) {
    const updated = await this.usersService.updateMyProfile(user.id, dto);
    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.ONBOARDING_PROFILE_UPDATED,
      resourceType: 'User',
      resourceId: user.id,
      metadata: {
        fields: Object.keys(dto),
        // Do NOT log the values themselves (could contain PII)
      },
    });
    return updated;
  }

  /**
   * Sprint 29: onboarding status for the current user.
   * Returns profile/risk/broker completion + canStartTrading + missingSteps.
   * Does NOT expose broker credentials or sensitive fields.
   */
  @Get('users/me/onboarding-status')
  @ApiOperation({ summary: 'Get current user onboarding status (Sprint 29)' })
  async getOnboardingStatus(@CurrentUser() user: User) {
    return this.onboardingService.getOnboardingStatus(user.id);
  }

  @Get('admin/users')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] List all users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listUsers(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.usersService.findAll(page, limit);
  }

  @Get('admin/users/:id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Get user by ID' })
  async getUserById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  /**
   * Sprint 29: admin visibility into a user's onboarding status.
   * Admins can see whether a user has completed profile/risk/broker setup
   * and whether they can start trading. Does NOT expose broker credentials.
   */
  @Get('admin/users/:id/onboarding-status')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Get user onboarding status by ID (Sprint 29)' })
  async getUserOnboardingStatus(@Param('id') id: string) {
    return this.onboardingService.getOnboardingStatus(id);
  }
}
