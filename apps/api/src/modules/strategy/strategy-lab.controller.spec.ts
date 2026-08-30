import { Test } from '@nestjs/testing';
import { StrategyLabController } from './strategy-lab.controller';
import { StrategyLabService } from './strategy-lab.service';

describe('StrategyLabController', () => {
  it('returns the read-only Strategy Lab snapshot', async () => {
    const snapshot = {
      dataset: { version: '1.0.0' },
      methodology: {},
      scenarios: [],
      disclaimer: 'advisory only',
    };
    const strategyLab = { getSnapshot: jest.fn().mockReturnValue(snapshot) };
    const module = await Test.createTestingModule({
      controllers: [StrategyLabController],
      providers: [{ provide: StrategyLabService, useValue: strategyLab }],
    }).compile();

    const controller = module.get(StrategyLabController);
    expect(controller.getLab()).toBe(snapshot);
    expect(strategyLab.getSnapshot).toHaveBeenCalledTimes(1);

    await module.close();
  });
});
