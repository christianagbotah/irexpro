import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StrategyLabResponseDto } from './dto/strategy-lab-response.dto';
import { StrategyLabService } from './strategy-lab.service';

@ApiTags('Strategy')
@Controller('strategy')
export class StrategyLabController {
  constructor(private readonly strategyLab: StrategyLabService) {}

  @Get('lab')
  @ApiOperation({
    summary: 'Get deterministic Strategy Lab comparisons',
    description:
      'Returns checksum-verified historical fixtures scored with fixed methodology and hard constraints. The endpoint is read-only and cannot place trades, alter risk limits, or mutate broker state.',
  })
  getLab(): StrategyLabResponseDto {
    return this.strategyLab.getSnapshot();
  }
}
