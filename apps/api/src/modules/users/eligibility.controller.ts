import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AcceptEligibilityDisclosuresDto } from './dto/accept-eligibility-disclosures.dto';
import { ReviewUserEligibilityDto } from './dto/review-user-eligibility.dto';
import { EligibilityService } from './eligibility.service';
import { RoleName } from './entities/role.entity';

/**
 * Sprint 44 — Eligibility & Disclosure Gate.
 *
 * These endpoints are evidence/readiness controls only. They do not expose
 * broker credentials, risk overrides, order submission, or execution methods.
 */
@ApiTags('Eligibility')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class EligibilityController {
  constructor(private readonly eligibilityService: EligibilityService) {}

  @Get('users/me/eligibility')
  @ApiOperation({ summary: 'Get current eligibility, disclosure, and consent status' })
  getMyEligibility(@CurrentUserId() userId: string) {
    return this.eligibilityService.getStatus(userId);
  }

  @Post('users/me/eligibility/disclosures')
  @ApiOperation({ summary: 'Accept exact current disclosure versions with immutable evidence' })
  acceptDisclosures(@CurrentUserId() userId: string, @Body() dto: AcceptEligibilityDisclosuresDto) {
    return this.eligibilityService.acceptDisclosures(userId, dto);
  }

  @Get('admin/eligibility/reviews')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] List users requiring jurisdiction review' })
  listReviews() {
    return this.eligibilityService.listReviewQueue();
  }

  @Post('admin/eligibility/users/:id/review')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Append an immutable jurisdiction review decision' })
  reviewUser(
    @Param('id') userId: string,
    @CurrentUserId() reviewerUserId: string,
    @Body() dto: ReviewUserEligibilityDto,
  ) {
    return this.eligibilityService.reviewUser(userId, reviewerUserId, dto);
  }
}
