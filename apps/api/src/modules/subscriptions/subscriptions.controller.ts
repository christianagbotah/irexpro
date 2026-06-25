import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SubscriptionsService } from './subscriptions.service';
import { ManualActivateDto } from './dto/manual-activate.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { RoleName } from '../users/entities/role.entity';

@ApiTags('Subscriptions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List all active subscription plans' })
  async getPlans() {
    return this.subscriptionsService.findActivePlans();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user subscription' })
  async getMySubscription(@CurrentUser() user: User) {
    return this.subscriptionsService.findUserSubscription(user.id);
  }

  /**
   * DEV/TEST ONLY — Manual subscription activation via ManualPaymentProvider.
   *
   * WARNING: This endpoint is not for commercial use. It bypasses the payment
   * provider and must only be used for development, testing, and supervised
   * pilot onboarding by platform admins.
   */
  @Post('dev/manual-activate')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[DEV/TEST ONLY] Manually activate a subscription — Admin only',
    description:
      'DEVELOPMENT AND TESTING ONLY. Uses ManualPaymentProvider. ' +
      'Not for commercial use. All activations are audit-logged.',
  })
  @ApiResponse({ status: 200, description: 'Subscription manually activated' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async manualActivate(
    @Body() dto: ManualActivateDto,
    @CurrentUser() admin: User,
    @Req() req: Request,
  ) {
    return this.subscriptionsService.manualActivate(
      dto.userId,
      dto.planId,
      admin.id,
      req.ip,
    );
  }
}
