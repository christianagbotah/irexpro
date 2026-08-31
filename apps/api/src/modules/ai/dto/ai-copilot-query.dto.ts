import { IsIn, IsString, Matches } from 'class-validator';
import { MARKET_INTELLIGENCE_TIMEFRAMES } from '../../market-data/dto/market-intelligence-query.dto';

export class AiCopilotQueryDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,24}$/)
  instrument: string;

  @IsIn(MARKET_INTELLIGENCE_TIMEFRAMES)
  timeframe: (typeof MARKET_INTELLIGENCE_TIMEFRAMES)[number] = 'H1';
}
