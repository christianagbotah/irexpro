import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  InternalApiKeyGuard,
  INTERNAL_API_KEY_HEADER,
} from '../../common/guards/internal-api-key.guard';
import { MarketDataService } from './market-data.service';
import { MarketIntelligenceService } from './market-intelligence.service';
import { InternalOhlcvQueryDto } from './dto/internal-ohlcv-query.dto';
import { InternalOhlcvResponseDto } from './dto/internal-ohlcv-response.dto';
import { MarketIntelligenceQueryDto } from './dto/market-intelligence-query.dto';
import { MarketIntelligenceResponseDto } from './dto/market-intelligence-response.dto';

@ApiTags('Market Data')
@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly marketIntelligenceService: MarketIntelligenceService,
  ) {}

  /**
   * GET /api/v1/market-data/intelligence
   *
   * JWT-authenticated, browser-safe broker market projection. The active broker
   * connection is resolved server-side and its identifier never enters the
   * response contract.
   */
  @Get('intelligence')
  @ApiOperation({
    summary: 'Get broker-authoritative market quote and candles',
    description:
      'Returns sanitized bid/ask/spread, OHLCV candles, freshness, and provenance for the authenticated user. Read-only; no order or broker mutation controls.',
  })
  async getIntelligence(
    @CurrentUserId() userId: string,
    @Query() query: MarketIntelligenceQueryDto,
  ): Promise<MarketIntelligenceResponseDto> {
    return this.marketIntelligenceService.getSnapshot(userId, query);
  }

  /**
   * GET /api/v1/market-data/internal/ohlcv
   *
   * Fetches OHLCV candles via the user's connected broker adapter.
   * Never exposes broker credentials in the response.
   */
  @Get('internal/ohlcv')
  @Public()
  @UseGuards(InternalApiKeyGuard)
  @ApiOperation({
    summary: '[INTERNAL] Fetch OHLCV candles via broker adapter',
    description:
      'Service-to-service endpoint for the Python AI engine. ' +
      'Requires internal API key. Returns normalized decimal-safe OHLCV candles only.',
  })
  @ApiHeader({
    name: INTERNAL_API_KEY_HEADER,
    description: 'Internal service API key',
    required: true,
  })
  async getInternalOhlcv(@Query() query: InternalOhlcvQueryDto): Promise<InternalOhlcvResponseDto> {
    return this.marketDataService.getInternalOhlcv(query);
  }
}
