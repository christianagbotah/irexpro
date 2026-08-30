export type StrategyLabMarketRegime = 'TRENDING' | 'RANGING' | 'VOLATILE';
export type StrategyLabVolatility = 'LOW' | 'MODERATE' | 'HIGH';
export type StrategyLabConstraintCode = 'MAX_DRAWDOWN' | 'MIN_PROFIT_FACTOR' | 'MAX_EXPOSURE';

export interface StrategyLabDatasetView {
  id: string;
  version: string;
  asOf: string;
  checksumSha256: string;
  methodologyVersion: string;
}

export interface StrategyLabMethodologyView {
  objective: string;
  weights: {
    expectedReturn: number;
    profitFactor: number;
    drawdownProtection: number;
    stability: number;
    winRate: number;
  };
  constraints: {
    maxDrawdownPct: number;
    minProfitFactor: number;
    maxExposurePct: number;
  };
}

export interface StrategyLabMetricsView {
  expectedReturnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
  stability: number;
  exposurePct: number;
}

export interface StrategyLabScorecardView {
  expectedReturn: number;
  profitFactor: number;
  drawdownProtection: number;
  stability: number;
  winRate: number;
}

export interface StrategyLabConstraintResultView {
  code: StrategyLabConstraintCode;
  label: string;
  passed: boolean;
  actual: number;
  limit: number;
}

export interface StrategyLabCandidateView {
  rank: number;
  strategyCode: string;
  name: string;
  timeframe: string;
  eligible: boolean;
  score: number;
  metrics: StrategyLabMetricsView;
  scorecard: StrategyLabScorecardView;
  constraints: StrategyLabConstraintResultView[];
  rationale: string[];
  tradeoffs: string[];
}

export interface StrategyLabScenarioView {
  id: string;
  name: string;
  marketRegime: StrategyLabMarketRegime;
  volatility: StrategyLabVolatility;
  description: string;
  recommendation: {
    strategyCode: string;
    summary: string;
  };
  candidates: StrategyLabCandidateView[];
}

export interface StrategyLabView {
  dataset: StrategyLabDatasetView;
  methodology: StrategyLabMethodologyView;
  scenarios: StrategyLabScenarioView[];
  disclaimer: string;
}
