import { RiskViolation } from './entities/risk-violation.entity';
import { RiskViolationSummaryResponseDto } from './dto/risk-intelligence-response.dto';

/**
 * Public risk-violation projection.
 *
 * Never expose userId, signalId, or riskContext. riskContext can contain
 * balances, equity, proposed order parameters, and other internal evidence.
 */
export function toRiskViolationSummary(violation: RiskViolation): RiskViolationSummaryResponseDto {
  return {
    id: violation.id,
    rejectionCode: violation.rejectionCode,
    rejectionReason: violation.rejectionReason,
    evaluatedAt: violation.evaluatedAt,
  };
}
