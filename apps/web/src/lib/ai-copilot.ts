import { createAiCopilotApi } from '@irexpro/api-client/ai-copilot';
import type {
  AiCopilotEvidenceSource,
  AiCopilotEvidenceState,
  AiCopilotPolicyView,
  AiCopilotPosture,
  AiCopilotRequest,
  AiCopilotStatus,
  AiCopilotTimeframe,
  AiCopilotView,
} from '@irexpro/types/ai-copilot';
import { api } from '@/lib/api';

const copilotApi = createAiCopilotApi(api);

const TIMEFRAMES = new Set<AiCopilotTimeframe>(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']);
const STATUSES = new Set<AiCopilotStatus>(['READY', 'PARTIAL']);
const POSTURES = new Set<AiCopilotPosture>(['NORMAL', 'CAUTION', 'BLOCKED']);
const FRESHNESS = new Set(['FRESH', 'STALE']);
const EVIDENCE_SOURCES = new Set<AiCopilotEvidenceSource>([
  'MARKET',
  'RISK',
  'AI_DECISION',
  'STRATEGY_RESEARCH',
]);
const EVIDENCE_STATES = new Set<AiCopilotEvidenceState>([
  'FRESH',
  'STALE',
  'AVAILABLE',
  'NONE',
  'UNAVAILABLE',
  'BLOCKED',
]);
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const INSTRUMENT = /^[A-Z0-9._-]{3,24}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}

function isIsoString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL.test(value) && Number.isFinite(Number(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && Number.isFinite(value);
}

function isMarket(value: unknown): value is AiCopilotView['market'] {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['freshness', 'bid', 'ask', 'spread', 'quoteAt', 'retrievedAt'])) {
    return false;
  }
  return (
    typeof value.freshness === 'string' &&
    FRESHNESS.has(value.freshness) &&
    isDecimal(value.bid) &&
    isDecimal(value.ask) &&
    isDecimal(value.spread) &&
    isIsoString(value.quoteAt) &&
    isIsoString(value.retrievedAt)
  );
}

function isRisk(value: unknown): value is AiCopilotView['risk'] {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'killSwitchActive',
      'brokerConnected',
      'riskAcknowledgementAccepted',
      'openPositionSlotsRemaining',
      'dailyTradeSlotsRemaining',
      'stalePortfolioSnapshots',
      'unavailablePortfolioSnapshots',
      'recentViolationCount',
    ])
  ) {
    return false;
  }
  return (
    typeof value.killSwitchActive === 'boolean' &&
    typeof value.brokerConnected === 'boolean' &&
    typeof value.riskAcknowledgementAccepted === 'boolean' &&
    isFiniteNonNegativeInt(value.openPositionSlotsRemaining) &&
    isFiniteNonNegativeInt(value.dailyTradeSlotsRemaining) &&
    isFiniteNonNegativeInt(value.stalePortfolioSnapshots) &&
    isFiniteNonNegativeInt(value.unavailablePortfolioSnapshots) &&
    isFiniteNonNegativeInt(value.recentViolationCount)
  );
}

function isDecision(value: unknown): value is AiCopilotView['decision'] {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'signalId',
      'outcome',
      'direction',
      'confidenceScore',
      'strategyCode',
      'modelVersion',
      'marketRegime',
      'receivedAt',
      'riskDecision',
      'executionStatus',
    ])
  ) {
    return false;
  }
  return (
    typeof value.signalId === 'string' &&
    typeof value.outcome === 'string' &&
    typeof value.outcome === 'string' &&
    (value.direction === null || value.direction === 'BUY' || value.direction === 'SELL') &&
    (value.confidenceScore === null ||
      (typeof value.confidenceScore === 'number' &&
        Number.isFinite(value.confidenceScore) &&
        value.confidenceScore >= 0 &&
        value.confidenceScore <= 1)) &&
    isNullableString(value.strategyCode) &&
    isNullableString(value.modelVersion) &&
    isNullableString(value.marketRegime) &&
    isIsoString(value.receivedAt) &&
    (value.riskDecision === 'APPROVED' ||
      value.riskDecision === 'REJECTED' ||
      value.riskDecision === 'UNKNOWN') &&
    isNullableString(value.executionStatus)
  );
}

function isStrategyResearch(value: unknown): value is AiCopilotView['strategyResearch'] {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'datasetId',
      'datasetVersion',
      'asOf',
      'scenarioId',
      'marketRegime',
      'strategyCode',
      'eligible',
      'score',
      'advisoryOnly',
    ])
  ) {
    return false;
  }
  return (
    typeof value.datasetId === 'string' &&
    typeof value.datasetVersion === 'string' &&
    isIsoString(value.asOf) &&
    typeof value.scenarioId === 'string' &&
    typeof value.marketRegime === 'string' &&
    typeof value.strategyCode === 'string' &&
    typeof value.eligible === 'boolean' &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score) &&
    value.advisoryOnly === true
  );
}

function isEvidenceItem(value: unknown): value is AiCopilotView['evidence'][number] {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['source', 'state', 'summary'])) return false;
  return (
    typeof value.source === 'string' &&
    EVIDENCE_SOURCES.has(value.source as AiCopilotEvidenceSource) &&
    typeof value.state === 'string' &&
    EVIDENCE_STATES.has(value.state as AiCopilotEvidenceState) &&
    typeof value.summary === 'string'
  );
}

function isPolicy(value: unknown): value is AiCopilotPolicyView {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'explanationOnly',
      'noTradeInstruction',
      'hiddenReasoningExposed',
      'strategyResearchAdvisoryOnly',
    ])
  ) {
    return false;
  }
  return (
    value.explanationOnly === true &&
    value.noTradeInstruction === true &&
    value.hiddenReasoningExposed === false &&
    value.strategyResearchAdvisoryOnly === true
  );
}

export function isAiCopilotView(value: unknown): value is AiCopilotView {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'generatedAt',
      'instrument',
      'timeframe',
      'status',
      'posture',
      'headline',
      'explanation',
      'market',
      'risk',
      'decision',
      'strategyResearch',
      'evidence',
      'nextChecks',
      'policy',
    ])
  ) {
    return false;
  }

  return (
    isIsoString(value.generatedAt) &&
    typeof value.instrument === 'string' &&
    INSTRUMENT.test(value.instrument) &&
    typeof value.timeframe === 'string' &&
    TIMEFRAMES.has(value.timeframe as AiCopilotTimeframe) &&
    typeof value.status === 'string' &&
    STATUSES.has(value.status as AiCopilotStatus) &&
    typeof value.posture === 'string' &&
    POSTURES.has(value.posture as AiCopilotPosture) &&
    typeof value.headline === 'string' &&
    value.headline.length > 0 &&
    typeof value.explanation === 'string' &&
    value.explanation.length > 0 &&
    (value.market === null || isMarket(value.market)) &&
    (value.risk === null || isRisk(value.risk)) &&
    (value.decision === null || isDecision(value.decision)) &&
    (value.strategyResearch === null || isStrategyResearch(value.strategyResearch)) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidenceItem) &&
    Array.isArray(value.nextChecks) &&
    value.nextChecks.every((item) => typeof item === 'string') &&
    isPolicy(value.policy)
  );
}

/**
 * Load the Contextual AI Copilot evidence-explanation contract and reject the
 * entire payload when the API broadens or mutates its browser contract.
 *
 * Fail-closed: on ANY validation failure, throws a sanitized contract-mismatch
 * error. No partial or fabricated evidence is returned.
 */
export async function loadAiCopilot(request: AiCopilotRequest): Promise<AiCopilotView> {
  const snapshot = await copilotApi.getContext(request);
  if (!isAiCopilotView(snapshot)) {
    throw new Error('AI Copilot contract mismatch');
  }
  return snapshot;
}
