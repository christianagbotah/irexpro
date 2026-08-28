import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RiskIntelligenceService } from './risk-intelligence.service';

@ApiTags('Risk Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('risk/intelligence')
export class RiskIntelligenceController {
  constructor(private readonly intelligenceService: RiskIntelligenceService) {}

  @Get()
  @ApiOperation({
    summary: 'Get frontend-safe portfolio and risk intelligence',
    description:
      'Returns policy, capacity, portfolio freshness, and sanitized recent risk vetoes. ' +
      'Never exposes raw riskContext, signal lineage, ownership IDs, or derived financial performance.',
  })
  @ApiResponse({ status: 200, description: 'Portfolio and risk intelligence snapshot' })
  async getIntelligence(@CurrentUserId() userId: string) {
    return this.intelligenceService.getIntelligence(userId);
  }
}
