import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { AiDecisionExplorerService } from './ai-decision-explorer.service';
import { AiDecisionExplorerResponseDto } from './dto/ai-decision-explorer-response.dto';

@ApiTags('AI')
@Controller('ai')
export class AiDecisionExplorerController {
  constructor(private readonly decisionExplorer: AiDecisionExplorerService) {}

  @Get('decisions')
  @ApiOperation({
    summary: 'Get recent persisted AI decision evidence for the authenticated user',
    description:
      'Returns a strict read-only projection of signal facts, eligibility/risk gates, and execution lifecycle. Raw model metadata, chain-of-thought, credentials, financial calculations, and internal error payloads are never returned.',
  })
  async getRecentDecisions(
    @CurrentUserId() userId: string,
  ): Promise<AiDecisionExplorerResponseDto> {
    return this.decisionExplorer.getRecentDecisions(userId);
  }
}
