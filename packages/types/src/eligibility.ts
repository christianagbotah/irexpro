export type EligibilityDisclosureKey =
  | 'AUTOMATED_TRADING_RISK'
  | 'NO_PROFIT_GUARANTEE'
  | 'BROKER_EXECUTION_AUTHORITY'
  | 'LEGAL_ELIGIBILITY_ATTESTATION';

export type EligibilityJurisdictionStatus =
  | 'MISSING_PROFILE'
  | 'REVIEW_REQUIRED'
  | 'ELIGIBLE'
  | 'INELIGIBLE';

export type EligibilityDecisionSource = 'POLICY' | 'ADMIN_REVIEW';
export type EligibilityReviewDecision = 'APPROVED' | 'DENIED';
export type EligibilityAgeStatus = 'MISSING_DOB' | 'INVALID_DOB' | 'UNDER_18' | 'ADULT';
export type KycStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type KycReviewDecision = 'APPROVED' | 'REJECTED';

export interface EligibilityDisclosureView {
  key: EligibilityDisclosureKey;
  version: string;
  title: string;
  body: string;
  contentSha256: string;
  required: true;
}

export interface EligibilityConsentEvidenceView {
  key: EligibilityDisclosureKey;
  version: string;
  contentSha256: string;
  acceptedAt: string;
}

export interface EligibilityStatusView {
  policyVersion: string;
  countryCode: string | null;
  jurisdictionStatus: EligibilityJurisdictionStatus;
  decisionSource: EligibilityDecisionSource;
  reasonCode: string;
  reviewedAt: string | null;
  ageStatus: EligibilityAgeStatus;
  /** Effective KYC state resolved from current-DOB immutable review evidence. */
  kycStatus: KycStatus;
  identityReasonCode: string;
  disclosures: EligibilityDisclosureView[];
  consents: EligibilityConsentEvidenceView[];
  missingConsentKeys: EligibilityDisclosureKey[];
  canProceed: boolean;
}

export interface EligibilityDisclosureAcceptance {
  key: EligibilityDisclosureKey;
  version: string;
  contentSha256: string;
}

export interface AcceptEligibilityDisclosuresRequest {
  acceptances: EligibilityDisclosureAcceptance[];
}

export interface EligibilityReviewQueueItem {
  userId: string;
  email: string | null;
  countryCode: string;
  policyVersion: string;
  jurisdictionStatus: 'REVIEW_REQUIRED';
  reasonCode: string;
}

export interface ReviewUserEligibilityRequest {
  decision: EligibilityReviewDecision;
  reasonCode: string;
  reviewerNote?: string;
}

export interface KycReviewQueueItem {
  userId: string;
  email: string | null;
  countryCode: string | null;
  dateOfBirth: string;
  ageStatus: 'ADULT';
  kycStatus: 'NONE' | 'PENDING';
  reasonCode: 'KYC_REQUIRED' | 'KYC_PENDING';
}

export interface ReviewUserKycRequest {
  decision: KycReviewDecision;
  reasonCode: string;
  reviewerNote?: string;
}
