import { RiskIntelligenceController } from './risk-intelligence.controller';
import { RiskIntelligenceService } from './risk-intelligence.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('RiskIntelligenceController', () => {
  it('passes only the authenticated user ID to the read model', async () => {
    const intelligenceService = {
      getIntelligence: jest.fn().mockResolvedValue({}),
    };
    const controller = new RiskIntelligenceController(
      intelligenceService as unknown as RiskIntelligenceService,
    );

    await controller.getIntelligence(USER_ID);

    expect(intelligenceService.getIntelligence).toHaveBeenCalledWith(USER_ID);
    expect(typeof intelligenceService.getIntelligence.mock.calls[0][0]).toBe('string');
  });
});
