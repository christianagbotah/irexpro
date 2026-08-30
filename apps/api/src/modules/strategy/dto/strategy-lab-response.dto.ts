export type StrategyLabMarketRegime = 'TRENDING' | 'RANGING' | 'VOLATILE';
export type StrategyLabVolatility = 'LOW' | 'MODERATE' | 'HIGH';
export type StrategyLabConstraintCode = 'MAX_DRAWDOWN' | 'MIN_PROFIT_FACTOR' | 'MAX_EXPOSURE';

export interface StrategyLabDatasetDto {
  id: string;
  version: string;
  asOf: string;
  checksumSha256: string;
  methodologyVersion: string;
}

export interface StrategyLabMethodologyDto {
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

export interface StrategyLabMetricsDto {
  expectedReturnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
  stability: number;
  exposurePct: number;
}

export interface StrategyLabScorecardDto {
  expectedReturn: number;
  profitFactor: number;
  drawdownProtection: number;
  stability: number;
  winRate: number;
}

export interface StrategyLabConstraintResultDto {
  code: StrategyLabConstraintCode;
  label: string;
  passed: boolean;
  actual: number;
  limit: number;
}

export interface StrategyLabCandidateDto {
  rank: number;
  strategyCode: string;
  name: string;
  timeframe: string;
  eligible: boolean;
  score: number;
  metrics: StrategyLabMetricsDto;
  scorecard: StrategyLabScorecardDto;
  constraints: StrategyLabConstraintResultDto[];
  rationale: string[];
  tradeoffs: string[];
}

export interface StrategyLabRecommendationDto {
  strategyCode: string;
  summary: string;
}

export interface StrategyLabScenarioDto {
  id: string;
  name: string;
  marketRegime: StrategyLabMarketRegime;
  volatility: StrategyLabVolatility;
  description: string;
  recommendation: StrategyLabRecommendationDto;
  candidates: StrategyLabCandidateDto[];
}

/**
 * Browser-safe, deterministic Strategy Lab projection.
 *
 * The lab is advisory and read-only. It does not expose broker credentials,
 * live order controls, model chain-of-thought, raw risk context, or any path
 * that can bypass the production Risk Engine.
 */
export interface StrategyLabResponseDto {
  dataset: StrategyLabDatasetDto;
  methodology: StrategyLabMethodologyDto;
  scenarios: StrategyLabScenarioDto[];
  disclaimer: string;
}
