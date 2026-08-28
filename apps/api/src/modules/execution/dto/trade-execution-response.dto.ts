import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trade, TradeCloseReason, TradeDirection, TradeStatus } from '../entities/trade.entity';

/**
 * Frontend-safe execution read model.
 *
 * Deliberately excludes internal ownership, signal lineage, idempotency keys,
 * broker connection identifiers, raw external order identifiers, broker
 * rejection diagnostics, and realised P&L. Realised P&L is withheld here
 * because the Trade entity does not carry its account currency; exposing a
 * currency-less monetary value would be ambiguous for a global client.
 */
export class TradeExecutionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  instrument: string;

  @ApiProperty({ enum: TradeDirection })
  direction: TradeDirection;

  @ApiProperty({ description: 'Risk-engine validated lot size as a decimal string.' })
  lotSize: string;

  @ApiProperty({ description: 'Requested entry price as a decimal string.' })
  requestedEntryPrice: string;

  @ApiPropertyOptional({ nullable: true, description: 'Authoritative broker fill price.' })
  fillPrice: string | null;

  @ApiProperty({ description: 'Validated stop-loss price as a decimal string.' })
  stopLoss: string;

  @ApiProperty({ description: 'Validated take-profit price as a decimal string.' })
  takeProfit: string;

  @ApiPropertyOptional({ nullable: true })
  trailingStopPips: string | null;

  @ApiProperty({ enum: TradeStatus })
  status: TradeStatus;

  @ApiPropertyOptional({ nullable: true })
  exitPrice: string | null;

  @ApiPropertyOptional({ enum: TradeCloseReason, nullable: true })
  closeReason: TradeCloseReason | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  openedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  closedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export function toTradeExecutionResponse(trade: Trade): TradeExecutionResponseDto {
  return {
    id: trade.id,
    instrument: trade.instrument,
    direction: trade.direction,
    lotSize: trade.lotSize,
    requestedEntryPrice: trade.requestedEntryPrice,
    fillPrice: trade.fillPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    trailingStopPips: trade.trailingStopPips,
    status: trade.status,
    exitPrice: trade.exitPrice,
    closeReason: trade.closeReason,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
  };
}
