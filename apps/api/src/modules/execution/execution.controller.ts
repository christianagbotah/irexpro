import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { ExecutionReadService } from './execution-read.service';
import { ExecutionService } from './execution.service';
import {
  TradeExecutionResponseDto,
  toTradeExecutionResponse,
} from './dto/trade-execution-response.dto';

/**
 * Frontend-safe execution API.
 *
 * Read routes (GET) use ExecutionReadService for read-only queries.
 * Write routes (PATCH/POST) use ExecutionService for order lifecycle operations.
 *
 * All routes are protected by the global JwtAuthGuard. The controller accepts
 * only the authenticated user's UUID and returns explicit DTOs rather than raw
 * execution entities.
 */
@ApiTags('Execution')
@Controller('execution')
export class ExecutionController {
  constructor(
    private readonly executionReadService: ExecutionReadService,
    private readonly executionService: ExecutionService,
  ) {}

  @Get('positions/open')
  @ApiOperation({ summary: 'List current open positions for the authenticated user' })
  @ApiResponse({ status: 200, type: TradeExecutionResponseDto, isArray: true })
  async listOpenPositions(@CurrentUserId() userId: string): Promise<TradeExecutionResponseDto[]> {
    const trades = await this.executionReadService.listOpenPositions(userId);
    return trades.map(toTradeExecutionResponse);
  }

  @Get('trades/recent')
  @ApiOperation({ summary: 'List recent execution lifecycle records for the authenticated user' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, type: TradeExecutionResponseDto, isArray: true })
  async listRecentExecutions(
    @CurrentUserId() userId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<TradeExecutionResponseDto[]> {
    const trades = await this.executionReadService.listRecentExecutions(userId, limit);
    return trades.map(toTradeExecutionResponse);
  }

  @Patch('trades/:tradeId/amend')
  @ApiOperation({ summary: 'Amend stop-loss/take-profit on an open trade' })
  async amendTrade(
    @CurrentUserId() userId: string,
    @Param('tradeId') tradeId: string,
    @Body() body: { newStopLoss?: string; newTakeProfit?: string },
  ) {
    return this.executionService.amendTrade(tradeId, userId, body);
  }

  @Post('trades/:tradeId/cancel')
  @ApiOperation({ summary: 'Cancel a pending trade (before fill)' })
  async cancelTrade(
    @CurrentUserId() userId: string,
    @Param('tradeId') tradeId: string,
    @Body() body: { reason: string },
  ) {
    return this.executionService.cancelTrade(tradeId, userId, body.reason);
  }
}
