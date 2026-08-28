export type AiDecisionOutcome =
  | 'RECEIVED'
  | 'IGNORED'
  | 'RISK_APPROVED'
  | 'RISK_REJECTED'
  | 'EXECUTION_SUCCEEDED'
  | 'EXECUTION_FAILED';

export type AiDecisionStage = 'SIGNAL' | 'ELIGIBILITY' | 'RISK' | 'EXECUTION';

export type AiDecisionStageStatus = 'RECEIVED' | 'APPROVED' | 'REJECTED' | 'SUCCEEDED' | 'FAILED';

export interface AiDecisionEvidenceDto {
  instrument: string | null;
  direction: 'BUY' | 'SELL' | null;
  confidenceScore: number | null;
  strategyCode: string | null;
  modelVersion: string | null;
  timeframe: string | null;
  marketRegime: string | null;
  volatilityScore: number | null;
  generatedAt: string | null;
}

export interface AiDecisionTimelineEntryDto {
  stage: AiDecisionStage;
  status: AiDecisionStageStatus;
  code: string | null;
  message: string;
  at: string;
}

export interface AiDecisionTradeDto {
  tradeId: string;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
}

export interface AiDecisionSummaryDto {
  signalId: string;
  outcome: AiDecisionOutcome;
  receivedAt: string;
  evidence: AiDecisionEvidenceDto;
  risk: {
    decision: 'APPROVED' | 'REJECTED' | 'UNKNOWN';
    rejectionCode: string | null;
    rejectionReason: string | null;
  };
  execution: AiDecisionTradeDto | null;
  timeline: AiDecisionTimelineEntryDto[];
}

export interface AiDecisionExplorerResponseDto {
  generatedAt: string;
  decisions: AiDecisionSummaryDto[];
}
