import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TradingActivationService } from './trading-activation.service';
import { ActivateLiveTradingDto, DeactivateLiveTradingDto } from './dto/trading-activation.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

/**
 * TradingActivationController
 *
 * Controlled paper-to-live activation API.
 *
 * Access: Any authenticated user can check their own eligibility.
 * Only the user themselves can activate/deactivate their own live trading.
 */
@Controller('api/v1/trading-activation')
@UseGuards(RolesGuard)
export class TradingActivationController {
  constructor(private readonly service: TradingActivationService) {}

  /**
   * Check if the current user is eligible for live trading activation.
   */
  @Get('eligibility')
  async checkEligibility(@CurrentUserId() userId: string) {
    return this.service.checkEligibility(userId);
  }

  /**
   * Activate live trading (DEMO → LIVE, PAPER_ONLY → SEMI_AUTO/FULL_AUTO).
   */
  @Post('activate')
  async activate(@CurrentUserId() userId: string, @Body() dto: ActivateLiveTradingDto) {
    return this.service.activateLive(userId, dto.targetMode, dto.acknowledgement);
  }

  /**
   * Deactivate live trading (LIVE → DEMO, SEMI_AUTO/FULL_AUTO → PAPER_ONLY).
   */
  @Post('deactivate')
  async deactivate(@CurrentUserId() userId: string, @Body() dto: DeactivateLiveTradingDto) {
    return this.service.deactivateLive(userId, dto.reason);
  }
}
