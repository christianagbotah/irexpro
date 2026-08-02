import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TradingService } from './trading.service';
import { TradingSession } from '../execution/entities/trading-session.entity';
import { StartSessionDto } from './dto/start-session.dto';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';

/**
 * TradingController — Trading session lifecycle API.
 *
 * All routes are protected by the global JwtAuthGuard.
 *
 * POST /api/v1/trading/sessions/start       — start a new trading session
 * POST /api/v1/trading/sessions/:id/stop    — stop a specific session
 * GET  /api/v1/trading/sessions/active      — get current active session
 * GET  /api/v1/trading/sessions/:id         — get session by ID
 *
 * All session actions require:
 *   - Valid JWT (global guard)
 *   - Active subscription with allowsAiAutoTrading (enforced in TradingService)
 *   - Active broker connection (enforced in TradingService)
 *   - Kill switch not active (enforced in TradingService)
 */
@ApiTags('Trading')
@Controller('trading/sessions')
export class TradingController {
  private readonly logger = new Logger(TradingController.name);

  constructor(private readonly tradingService: TradingService) {}

  /**
   * Start a trading session.
   *
   * Enforces: subscription gate, broker gate, kill switch gate.
   * Demo mode is the broker default until explicitly changed.
   *
   * POST /api/v1/trading/sessions/start
   */
  @Post('start')
  @ApiOperation({
    summary: 'Start a new AI trading session',
    description:
      'Requires onboarding complete (profile + risk acknowledgement + broker connected), ' +
      'active subscription, healthy broker connection, and kill switch inactive. ' +
      'Returns the created TradingSession. PAPER_ONLY mode is the default. ' +
      'FULL_AUTO does NOT automatically enable live broker execution — live trading ' +
      'requires a separate explicit enablement on the broker connection.',
  })
  async startSession(
    @CurrentUserId() userId: string,
    @Body() dto: StartSessionDto,
  ): Promise<TradingSession> {
    return this.tradingService.startTradingSession(
      userId,
      dto.brokerConnectionId,
      dto.requestedMode,
    );
  }

  /**
   * Stop a specific trading session.
   *
   * Only the session owner can stop their own session.
   * Does NOT auto-close open trades in this sprint.
   *
   * POST /api/v1/trading/sessions/:id/stop
   */
  @Post(':id/stop')
  @ApiOperation({
    summary: 'Stop an active trading session',
    description:
      'Stops the specified session. Does not automatically close open trades. ' +
      'Emits a realtime session-stopped event.',
  })
  async stopSession(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<{ message: string; sessionId: string }> {
    await this.tradingService.stopTradingSession(userId, sessionId);
    return { message: 'Trading session stopped', sessionId };
  }

  /**
   * Get the current active session for the authenticated user.
   *
   * GET /api/v1/trading/sessions/active
   */
  @Get('active')
  @ApiOperation({ summary: 'Get the current active trading session' })
  async getActive(
    @CurrentUserId() userId: string,
  ): Promise<TradingSession | null> {
    return this.tradingService.getActiveSession(userId);
  }

  /**
   * Get a specific session by ID (must belong to authenticated user).
   *
   * GET /api/v1/trading/sessions/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a trading session by ID' })
  async getById(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<TradingSession> {
    const session = await this.tradingService.getSessionById(userId, sessionId);
    if (!session) {
      throw new NotFoundException(`Trading session ${sessionId} not found`);
    }
    return session;
  }
}
