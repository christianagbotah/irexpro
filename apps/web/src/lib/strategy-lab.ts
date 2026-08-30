import { createStrategyLabApi } from '@irexpro/api-client/strategy-lab';
import type {
  StrategyLabCandidateView,
  StrategyLabConstraintResultView,
  StrategyLabScenarioView,
  StrategyLabView,
} from '@irexpro/types/strategy-lab';
import { api } from '@/lib/api';

const strategyLabApi = createStrategyLabApi(api);
const REGIMES = new Set(['TRENDING', 'RANGING', 'VOLATILE']);
const VOLATILITY = new Set(['LOW', 'MODERATE', 'HIGH']);
const CONSTRAINT_CODES = new Set(['MAX_DRAWDOWN', 'MIN_PROFIT_FACTOR', 'MAX_EXPOSURE']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isUnitNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isPercentScore(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isConstraint(value: unknown): value is StrategyLabConstraintResultView {
  if (!isRecord(value) || !hasExactKeys(value, ['code', 'label', 'passed', 'actual', 'limit'])) {
    return false;
  }
  return (
    typeof value.code === 'string' &&
    CONSTRAINT_CODES.has(value.code) &&
    typeof value.label === 'string' &&
    typeof value.passed === 'boolean' &&
    isFiniteNumber(value.actual) &&
    isFiniteNumber(value.limit)
  );
}

function isCandidate(value: unknown): value is StrategyLabCandidateView {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'rank',
      'strategyCode',
      'name',
      'timeframe',
      'eligible',
      'score',
      'metrics',
      'scorecard',
      'constraints',
      'rationale',
      'tradeoffs',
    ])
  ) {
    return false;
  }

  const metrics = value.metrics;
  const scorecard = value.scorecard;
  if (
    !isRecord(metrics) ||
    !hasExactKeys(metrics, [
      'expectedReturnPct',
      'maxDrawdownPct',
      'winRate',
      'profitFactor',
      'stability',
      'exposurePct',
    ]) ||
    !isFiniteNumber(metrics.expectedReturnPct) ||
    !isFiniteNumber(metrics.maxDrawdownPct) ||
    !isUnitNumber(metrics.winRate) ||
    !isFiniteNumber(metrics.profitFactor) ||
    !isUnitNumber(metrics.stability) ||
    !isFiniteNumber(metrics.exposurePct)
  ) {
    return false;
  }

  if (
    !isRecord(scorecard) ||
    !hasExactKeys(scorecard, [
      'expectedReturn',
      'profitFactor',
      'drawdownProtection',
      'stability',
      'winRate',
    ]) ||
    !Object.values(scorecard).every(isPercentScore)
  ) {
    return false;
  }

  return (
    Number.isInteger(value.rank) &&
    (value.rank as number) > 0 &&
    typeof value.strategyCode === 'string' &&
    typeof value.name === 'string' &&
    typeof value.timeframe === 'string' &&
    typeof value.eligible === 'boolean' &&
    isPercentScore(value.score) &&
    Array.isArray(value.constraints) &&
    value.constraints.every(isConstraint) &&
    isStringArray(value.rationale) &&
    isStringArray(value.tradeoffs)
  );
}

function isScenario(value: unknown): value is StrategyLabScenarioView {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'name',
      'marketRegime',
      'volatility',
      'description',
      'recommendation',
      'candidates',
    ])
  ) {
    return false;
  }
  const recommendation = value.recommendation;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.marketRegime === 'string' &&
    REGIMES.has(value.marketRegime) &&
    typeof value.volatility === 'string' &&
    VOLATILITY.has(value.volatility) &&
    typeof value.description === 'string' &&
    isRecord(recommendation) &&
    hasExactKeys(recommendation, ['strategyCode', 'summary']) &&
    typeof recommendation.strategyCode === 'string' &&
    typeof recommendation.summary === 'string' &&
    Array.isArray(value.candidates) &&
    value.candidates.length > 0 &&
    value.candidates.every(isCandidate)
  );
}

export function isStrategyLabView(value: unknown): value is StrategyLabView {
  if (!isRecord(value) || !hasExactKeys(value, ['dataset', 'methodology', 'scenarios', 'disclaimer'])) {
    return false;
  }
  const dataset = value.dataset;
  const methodology = value.methodology;
  if (
    !isRecord(dataset) ||
    !hasExactKeys(dataset, ['id', 'version', 'asOf', 'checksumSha256', 'methodologyVersion']) ||
    typeof dataset.id !== 'string' ||
    typeof dataset.version !== 'string' ||
    typeof dataset.asOf !== 'string' ||
    Number.isNaN(new Date(dataset.asOf).getTime()) ||
    typeof dataset.checksumSha256 !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(dataset.checksumSha256) ||
    typeof dataset.methodologyVersion !== 'string'
  ) {
    return false;
  }

  if (!isRecord(methodology) || !hasExactKeys(methodology, ['objective', 'weights', 'constraints'])) {
    return false;
  }
  const weights = methodology.weights;
  const constraints = methodology.constraints;
  if (
    typeof methodology.objective !== 'string' ||
    !isRecord(weights) ||
    !hasExactKeys(weights, ['expectedReturn', 'profitFactor', 'drawdownProtection', 'stability', 'winRate']) ||
    !Object.values(weights).every(isUnitNumber) ||
    !isRecord(constraints) ||
    !hasExactKeys(constraints, ['maxDrawdownPct', 'minProfitFactor', 'maxExposurePct']) ||
    !Object.values(constraints).every(isFiniteNumber)
  ) {
    return false;
  }

  return (
    Array.isArray(value.scenarios) &&
    value.scenarios.length > 0 &&
    value.scenarios.every(isScenario) &&
    typeof value.disclaimer === 'string'
  );
}

export async function loadStrategyLab(): Promise<StrategyLabView> {
  const snapshot = await strategyLabApi.getSnapshot();
  if (!isStrategyLabView(snapshot)) {
    throw new Error('Strategy Lab contract mismatch');
  }
  return snapshot;
}
