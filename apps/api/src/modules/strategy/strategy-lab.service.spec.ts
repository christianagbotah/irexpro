import { StrategyLabService } from './strategy-lab.service';

const DATASET_CHECKSUM =
  'sha256:21540b6e21ccc999fc65edbbbe5891b762c5bf08b7abb34a58da7cd2ab72c02b';

describe('StrategyLabService', () => {
  it('returns the checksum-verified v1 dataset', () => {
    const snapshot = new StrategyLabService().getSnapshot();

    expect(snapshot.dataset).toEqual({
      id: 'strategy-lab-core',
      version: '1.0.0',
      asOf: '2026-08-29T00:00:00.000Z',
      checksumSha256: DATASET_CHECKSUM,
      methodologyVersion: 'scorecard.v1',
    });
  });

  it('is deterministic across repeated evaluations', () => {
    const service = new StrategyLabService();

    expect(service.getSnapshot()).toEqual(service.getSnapshot());
  });

  it('ranks Adaptive Trend H1 first in trend expansion', () => {
    const snapshot = new StrategyLabService().getSnapshot();
    const scenario = snapshot.scenarios.find((item) => item.id === 'trend-expansion');

    expect(scenario?.recommendation.strategyCode).toBe('TREND_H1');
    expect(scenario?.candidates[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        strategyCode: 'TREND_H1',
        eligible: true,
        score: 72.5,
      }),
    );
  });

  it('puts hard-constraint failures behind eligible candidates even when their raw score is higher', () => {
    const snapshot = new StrategyLabService().getSnapshot();
    const scenario = snapshot.scenarios.find((item) => item.id === 'volatility-shock');
    const breakout = scenario?.candidates.find((item) => item.strategyCode === 'BREAKOUT_M30');

    expect(scenario?.recommendation.strategyCode).toBe('TREND_H1');
    expect(scenario?.candidates[0].strategyCode).toBe('TREND_H1');
    expect(breakout).toEqual(
      expect.objectContaining({
        eligible: false,
        score: 52,
      }),
    );
    expect(breakout?.constraints.some((constraint) => !constraint.passed)).toBe(true);
  });

  it('never exposes execution or broker mutation controls in the snapshot', () => {
    const serialized = JSON.stringify(new StrategyLabService().getSnapshot());

    expect(serialized).not.toContain('brokerConnectionId');
    expect(serialized).not.toContain('idempotencyKey');
    expect(serialized).not.toContain('executeTrade');
    expect(serialized).not.toContain('riskContext');
  });
});
