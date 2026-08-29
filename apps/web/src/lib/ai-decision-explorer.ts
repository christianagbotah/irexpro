import { createAiDecisionExplorerApi } from '@irexpro/api-client/ai-decision-explorer';
import type {
  AiDecisionExplorerView,
  AiDecisionOutcome,
  AiDecisionStage,
  AiDecisionStageStatus,
  AiDecisionSummaryView,
  AiDecisionTimelineEntryView,
  AiDecisionTradeView,
} from '@irexpro/types/ai-decision-explorer';
import { api } from '@/lib/api';

const decisionExplorerApi = createAiDecisionExplorerApi(api);

const OUTCOMES = new Set<AiDecisionOutcome>([
  'RECEIVED',
  'IGNORED',
  'RISK_APPROVED',
  'RISK_REJECTED',
  'EXECUTION_SUCCEEDED',
  'EXECUTION_FAILED',
]);
const STAGES = new Set<AiDecisionStage>(['SIGNAL', 'ELIGIBILITY', 'RISK', 'EXECUTION']);
const STAGE_STATUSES = new Set<AiDecisionStageStatus>([
  'RECEIVED',
  'APPROVED',
  'REJECTED',
  'SUCCEEDED',
  'FAILED',
]);
const TRADE_STATUSES = new Set([
  'PENDING',
  'OPEN',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
  'RECONCILIATION_PENDING',
]);
const CLOSE_REASONS = new Set([
  'STOP_LOSS_HIT',
  'TAKE_PROFIT_HIT',
  'MANUAL_CLOSE',
  'AI_CLOSE_SIGNAL',
  'KILL_SWITCH_FORCE_CLOSE',
  'BROKER_CLOSE',
  'RECONCILIATION',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isIsoString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function isNullableIsoString(value: unknown): value is string | null {
  return value === null || isIsoString(value);
}

function isNullableScore(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
}

function isTimelineEntry(value: unknown): value is AiDecisionTimelineEntryView {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['stage', 'status', 'code', 'message', 'at'])) return false;
  return (
    typeof value.stage === 'string' &&
    STAGES.has(value.stage as AiDecisionStage) &&
    typeof value.status === 'string' &&
    STAGE_STATUSES.has(value.status as AiDecisionStageStatus) &&
    isNullableString(value.code) &&
    typeof value.message === 'string' &&
    isIsoString(value.at)
  );
}

function isTrade(value: unknown): value is AiDecisionTradeView {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['tradeId', 'status', 'openedAt', 'closedAt', 'closeReason'])) {
    return false;
  }
  return (
    typeof value.tradeId === 'string' &&
    typeof value.status === 'string' &&
    TRADE_STATUSES.has(value.status) &&
    isNullableIsoString(value.openedAt) &&
    isNullableIsoString(value.closedAt) &&
    (value.closeReason === null ||
      (typeof value.closeReason === 'string' && CLOSE_REASONS.has(value.closeReason)))
  );
}

function isDecision(value: unknown): value is AiDecisionSummaryView {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'signalId',
      'outcome',
      'receivedAt',
      'evidence',
      'risk',
      'execution',
      'timeline',
    ])
  ) {
    return false;
  }

  if (
    typeof value.signalId !== 'string' ||
    typeof value.outcome !== 'string' ||
    !OUTCOMES.has(value.outcome as AiDecisionOutcome) ||
    !isIsoString(value.receivedAt)
  ) {
    return false;
  }

  const evidence = value.evidence;
  if (
    !isRecord(evidence) ||
    !hasExactKeys(evidence, [
      'instrument',
      'direction',
      'confidenceScore',
      'strategyCode',
      'modelVersion',
      'timeframe',
      'marketRegime',
      'volatilityScore',
      'generatedAt',
    ]) ||
    !isNullableString(evidence.instrument) ||
    !(evidence.direction === null || evidence.direction === 'BUY' || evidence.direction === 'SELL') ||
    !isNullableScore(evidence.confidenceScore) ||
    !isNullableString(evidence.strategyCode) ||
    !isNullableString(evidence.modelVersion) ||
    !isNullableString(evidence.timeframe) ||
    !isNullableString(evidence.marketRegime) ||
    !isNullableScore(evidence.volatilityScore) ||
    !isNullableIsoString(evidence.generatedAt)
  ) {
    return false;
  }

  const risk = value.risk;
  if (
    !isRecord(risk) ||
    !hasExactKeys(risk, ['decision', 'rejectionCode', 'rejectionReason']) ||
    !(risk.decision === 'APPROVED' || risk.decision === 'REJECTED' || risk.decision === 'UNKNOWN') ||
    !isNullableString(risk.rejectionCode) ||
    !isNullableString(risk.rejectionReason)
  ) {
    return false;
  }

  if (!(value.execution === null || isTrade(value.execution))) return false;
  return Array.isArray(value.timeline) && value.timeline.every(isTimelineEntry);
}

export function isAiDecisionExplorerView(value: unknown): value is AiDecisionExplorerView {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['generatedAt', 'decisions'])) return false;
  return (
    isIsoString(value.generatedAt) &&
    Array.isArray(value.decisions) &&
    value.decisions.every(isDecision)
  );
}

/**
 * Load persisted decision evidence and reject the whole snapshot when the API
 * broadens or mutates its browser contract unexpectedly.
 */
export async function loadAiDecisionExplorer(): Promise<AiDecisionExplorerView> {
  const snapshot = await decisionExplorerApi.getRecentDecisions();
  if (!isAiDecisionExplorerView(snapshot)) {
    throw new Error('AI decision explorer contract mismatch');
  }
  return snapshot;
}
