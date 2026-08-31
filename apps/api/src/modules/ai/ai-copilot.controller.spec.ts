import { AiCopilotController } from './ai-copilot.controller';
import { AiCopilotService } from './ai-copilot.service';
import { AiCopilotQueryDto } from './dto/ai-copilot-query.dto';

describe('AiCopilotController', () => {
  it('uses the authenticated user id and validated context only', async () => {
    const response = {
      generatedAt: '2026-08-31T03:10:00.000Z',
      instrument: 'EURUSD',
      timeframe: 'H1',
      status: 'READY' as const,
      posture: 'NORMAL' as const,
      headline: 'Authoritative context is aligned',
      explanation: 'read-only',
      market: null,
      risk: null,
      decision: null,
      strategyResearch: null,
      evidence: [],
      nextChecks: [],
      policy: {
        explanationOnly: true as const,
        noTradeInstruction: true as const,
        hiddenReasoningExposed: false as const,
        strategyResearchAdvisoryOnly: true as const,
      },
    };
    const service = {
      getContext: jest.fn().mockResolvedValue(response),
    };
    const controller = new AiCopilotController(service as unknown as AiCopilotService);
    const query = { instrument: 'EURUSD', timeframe: 'H1' } as AiCopilotQueryDto;

    await expect(controller.getContext('user-1', query)).resolves.toEqual(response);
    expect(service.getContext).toHaveBeenCalledWith('user-1', query);
  });
});
