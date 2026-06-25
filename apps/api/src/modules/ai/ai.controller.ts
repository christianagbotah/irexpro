import {
  Body,
  Controller,
  ForbiddenException,
  Logger,
  Post,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AiSignalService } from './ai-signal.service';
import { SimulateSignalDto } from './dto/simulate-signal.dto';
import { StrategyResult } from '../strategy/interfaces/strategy.interface';

/**
 * AiController — DEV/TEST endpoints for the AI Signal Engine.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WARNING: POST /ai/dev/simulate-signal is DISABLED in production.
 * It is for local development and staging testing ONLY.
 *
 * All simulated signals go through the FULL pipeline:
 *   StrategyOrchestrator → RiskEngine → ExecutionEngine → Broker
 *
 * There is NO direct AI → Broker shortcut.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * JWT authentication is required on all routes (enforced by global JwtAuthGuard).
 */
@ApiTags('AI (Dev)')
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiSignalService: AiSignalService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * DEV/TEST ONLY: Simulate an AI signal for pipeline testing.
   *
   * Disabled in production (NODE_ENV=production).
   * Requires JWT authentication.
   * Routes signal through full pipeline — does NOT bypass Risk Engine.
   *
   * POST /api/v1/ai/dev/simulate-signal
   */
  @Post('dev/simulate-signal')
  @ApiOperation({
    summary: '[DEV ONLY] Simulate an AI signal for pipeline testing',
    description:
      'DISABLED IN PRODUCTION. Submits a simulated signal through the full ' +
      'Strategy Orchestrator → Risk Engine → Execution Engine pipeline. ' +
      'Does not bypass any safety gates.',
  })
  async simulateSignal(
    @Request() req: { user: { id: string } },
    @Body() dto: SimulateSignalDto,
  ): Promise<StrategyResult> {
    const env = this.configService.get<string>('app.env', 'development');
    if (env === 'production') {
      this.logger.warn(
        `DEV simulate-signal endpoint was called in PRODUCTION by user=${req.user.id} — BLOCKED`,
      );
      throw new ForbiddenException('This endpoint is disabled in production');
    }

    this.logger.log(
      `[DEV] Simulated signal from user=${req.user.id} ` +
      `instrument=${dto.instrument} direction=${dto.direction} ` +
      `session=${dto.tradingSessionId}`,
    );

    const candidate = this.aiSignalService.buildSimulatedCandidate(req.user.id, {
      tradingSessionId: dto.tradingSessionId,
      brokerConnectionId: dto.brokerConnectionId,
      instrument: dto.instrument,
      direction: dto.direction,
      confidenceScore: dto.confidenceScore,
      suggestedEntryPrice: dto.suggestedEntryPrice,
      suggestedStopLoss: dto.suggestedStopLoss,
      suggestedTakeProfit: dto.suggestedTakeProfit,
      suggestedVolume: dto.suggestedVolume,
      timeframe: dto.timeframe,
      strategyCode: dto.strategyCode,
      marketRegime: dto.marketRegime,
      volatilityScore: dto.volatilityScore,
      modelVersion: dto.modelVersion,
      metadata: { source: 'dev-simulate', env },
    });

    return this.aiSignalService.receiveSignal(candidate);
  }
}
