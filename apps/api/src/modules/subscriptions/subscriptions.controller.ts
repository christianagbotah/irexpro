import {
  Body,
  Controller,
  Get,
  Headers,
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
import { CheckoutDto, CancelSubscriptionDto } from './dto/checkout.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserId } from '../../common/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '../../common/interfaces/authenticated-principal.interface';
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
  async getMySubscription(@CurrentUserId() userId: string) {
    return this.subscriptionsService.findUserSubscription(userId);
  }

  /**
   * Initiate subscription checkout via the selected payment provider.
   *
   * IMPORTANT:
   * - Frontend payment success alone does NOT activate subscription.
   * - Subscription is activated ONLY after verified provider webhook.
   * - ManualPaymentProvider is NOT available through this endpoint.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate subscription checkout',
    description:
      'Creates a pending invoice and payment transaction, then returns a checkout URL or session ' +
      'reference. If an identical checkout is already pending, the existing invoice/transaction/ ' +
      'session is safely reused instead of creating a duplicate. Subscription is activated ONLY ' +
      'after verified provider webhook — never on frontend callback alone. Optionally accepts an ' +
      '`Idempotency-Key` header (or `idempotencyKey` body field) so repeated requests with the ' +
      'same key and parameters return the same result.',
  })
  @ApiResponse({ status: 201, description: 'Checkout session created or safely reused' })
  @ApiResponse({ status: 400, description: 'Invalid plan, pricing, or provider' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  @ApiResponse({ status: 409, description: 'Active subscription/paid invoice/idempotency conflict' })
  async checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    return this.subscriptionsService.initiateCheckout({
      userId: principal.userId,
      email: principal.email ?? undefined,
      planId: dto.planId,
      currency: dto.currency,
      countryCode: dto.countryCode ?? 'US',
      provider: dto.provider,
      ipAddress: req.ip,
      // Header takes precedence when present and non-empty; an empty/whitespace-only
      // header (e.g. a proxy forwarding an unset header as '') must not silently
      // shadow a valid body field (Sprint 16 audit fix).
      idempotencyKey: idempotencyKeyHeader?.trim() || dto.idempotencyKey,
    });
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel current subscription' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  @ApiResponse({ status: 404, description: 'No active subscription found' })
  async cancelSubscription(
    @Body() dto: CancelSubscriptionDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.subscriptionsService.cancelSubscription(userId, dto.reason, req.ip);
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
    @CurrentUserId() adminId: string,
    @Req() req: Request,
  ) {
    return this.subscriptionsService.manualActivate(
      dto.userId,
      dto.planId,
      adminId,
      req.ip,
    );
  }
}
