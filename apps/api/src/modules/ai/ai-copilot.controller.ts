import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { AiCopilotService } from './ai-copilot.service';
import { AiCopilotQueryDto } from './dto/ai-copilot-query.dto';
import { AiCopilotResponseDto } from './dto/ai-copilot-response.dto';

@ApiTags('AI')
@Controller('ai')
export class AiCopilotController {
  constructor(private readonly copilot: AiCopilotService) {}

  @Get('copilot/context')
  @ApiOperation({
    summary: 'Get evidence-based contextual AI Copilot explanation',
    description:
      'Composes existing browser-safe market, risk, persisted AI decision, and deterministic Strategy Lab evidence. The endpoint is read-only: it never places orders, changes broker or risk state, exposes credentials/provider identifiers, or returns hidden model reasoning.',
  })
  async getContext(
    @CurrentUserId() userId: string,
    @Query() query: AiCopilotQueryDto,
  ): Promise<AiCopilotResponseDto> {
    return this.copilot.getContext(userId, query);
  }
}
