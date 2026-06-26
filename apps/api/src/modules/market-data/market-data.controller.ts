import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  InternalApiKeyGuard,
  INTERNAL_API_KEY_HEADER,
} from '../../common/guards/internal-api-key.guard';
import { MarketDataService } from './market-data.service';
import { InternalOhlcvQueryDto } from './dto/internal-ohlcv-query.dto';
import { InternalOhlcvResponseDto } from './dto/internal-ohlcv-response.dto';

/**
 * Internal market-data endpoints for service-to-service use (Python AI engine).
 * Protected by x-irexpro-internal-api-key — not accessible via user JWT alone.
 */
@ApiTags('Market Data (Internal)')
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

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
  async getInternalOhlcv(
    @Query() query: InternalOhlcvQueryDto,
  ): Promise<InternalOhlcvResponseDto> {
    return this.marketDataService.getInternalOhlcv(query);
  }
}
