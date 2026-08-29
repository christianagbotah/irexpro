import { AiDecisionExplorerController } from './ai-decision-explorer.controller';
import { AiDecisionExplorerService } from './ai-decision-explorer.service';

describe('AiDecisionExplorerController', () => {
  it('uses only the authenticated user id for the decision read', async () => {
    const response = {
      generatedAt: '2026-08-28T22:30:00.000Z',
      decisions: [],
    };
    const service = {
      getRecentDecisions: jest.fn().mockResolvedValue(response),
    } as unknown as AiDecisionExplorerService;
    const controller = new AiDecisionExplorerController(service);

    await expect(controller.getRecentDecisions('user-1')).resolves.toEqual(response);
    expect(service.getRecentDecisions).toHaveBeenCalledWith('user-1');
  });
});
