export interface StrategyLabDatasetCandidate {
  strategyCode: string;
  name: string;
  timeframe: string;
  expectedReturnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
  stability: number;
  exposurePct: number;
}

export interface StrategyLabDatasetScenario {
  id: string;
  name: string;
  marketRegime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  volatility: 'LOW' | 'MODERATE' | 'HIGH';
  description: string;
  candidates: StrategyLabDatasetCandidate[];
}

/**
 * Immutable Strategy Lab v1 fixture.
 *
 * Values are deliberately deterministic and versioned so the same commit
 * produces the same scorecard in local development, CI, staging, and prod.
 * Changing any value requires a dataset version bump and checksum update.
 */
export const STRATEGY_LAB_DATASET = {
  id: 'strategy-lab-core',
  version: '1.0.0',
  asOf: '2026-08-29T00:00:00.000Z',
  methodologyVersion: 'scorecard.v1',
  scenarios: [
    {
      id: 'trend-expansion',
      name: 'Trend expansion',
      marketRegime: 'TRENDING',
      volatility: 'MODERATE',
      description: 'Directional market with sustained momentum and orderly pullbacks.',
      candidates: [
        {
          strategyCode: 'TREND_H1',
          name: 'Adaptive Trend H1',
          timeframe: 'H1',
          expectedReturnPct: 12.8,
          maxDrawdownPct: 7.4,
          winRate: 0.57,
          profitFactor: 1.62,
          stability: 0.84,
          exposurePct: 28,
        },
        {
          strategyCode: 'BREAKOUT_M30',
          name: 'Volatility Breakout M30',
          timeframe: 'M30',
          expectedReturnPct: 14.1,
          maxDrawdownPct: 11.2,
          winRate: 0.49,
          profitFactor: 1.48,
          stability: 0.72,
          exposurePct: 34,
        },
        {
          strategyCode: 'MEAN_REVERT_M15',
          name: 'Mean Reversion M15',
          timeframe: 'M15',
          expectedReturnPct: 5.6,
          maxDrawdownPct: 9.8,
          winRate: 0.63,
          profitFactor: 1.18,
          stability: 0.66,
          exposurePct: 31,
        },
      ],
    },
    {
      id: 'range-compression',
      name: 'Range compression',
      marketRegime: 'RANGING',
      volatility: 'LOW',
      description:
        'Compressed price action with repeated mean reversion and limited directional follow-through.',
      candidates: [
        {
          strategyCode: 'MEAN_REVERT_M15',
          name: 'Mean Reversion M15',
          timeframe: 'M15',
          expectedReturnPct: 10.7,
          maxDrawdownPct: 6.3,
          winRate: 0.66,
          profitFactor: 1.58,
          stability: 0.88,
          exposurePct: 29,
        },
        {
          strategyCode: 'TREND_H1',
          name: 'Adaptive Trend H1',
          timeframe: 'H1',
          expectedReturnPct: 4.2,
          maxDrawdownPct: 8.9,
          winRate: 0.44,
          profitFactor: 1.09,
          stability: 0.61,
          exposurePct: 24,
        },
        {
          strategyCode: 'BREAKOUT_M30',
          name: 'Volatility Breakout M30',
          timeframe: 'M30',
          expectedReturnPct: 3.4,
          maxDrawdownPct: 12.6,
          winRate: 0.38,
          profitFactor: 0.96,
          stability: 0.52,
          exposurePct: 37,
        },
      ],
    },
    {
      id: 'volatility-shock',
      name: 'Volatility shock',
      marketRegime: 'VOLATILE',
      volatility: 'HIGH',
      description:
        'Fast repricing with wider ranges, unstable follow-through, and elevated drawdown risk.',
      candidates: [
        {
          strategyCode: 'TREND_H1',
          name: 'Adaptive Trend H1',
          timeframe: 'H1',
          expectedReturnPct: 8.1,
          maxDrawdownPct: 10.6,
          winRate: 0.51,
          profitFactor: 1.31,
          stability: 0.71,
          exposurePct: 22,
        },
        {
          strategyCode: 'BREAKOUT_M30',
          name: 'Volatility Breakout M30',
          timeframe: 'M30',
          expectedReturnPct: 11.9,
          maxDrawdownPct: 14.8,
          winRate: 0.47,
          profitFactor: 1.36,
          stability: 0.62,
          exposurePct: 39,
        },
        {
          strategyCode: 'MEAN_REVERT_M15',
          name: 'Mean Reversion M15',
          timeframe: 'M15',
          expectedReturnPct: 2.2,
          maxDrawdownPct: 16.4,
          winRate: 0.54,
          profitFactor: 0.91,
          stability: 0.49,
          exposurePct: 33,
        },
      ],
    },
  ] satisfies StrategyLabDatasetScenario[],
} as const;

/** SHA-256 of JSON.stringify(STRATEGY_LAB_DATASET). */
export const STRATEGY_LAB_DATASET_SHA256 =
  '21540b6e21ccc999fc65edbbbe5891b762c5bf08b7abb34a58da7cd2ab72c02b';
