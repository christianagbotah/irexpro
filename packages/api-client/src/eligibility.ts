import type {
  AcceptEligibilityDisclosuresRequest,
  EligibilityConsentEvidenceView,
  EligibilityDisclosureKey,
  EligibilityDisclosureView,
  EligibilityReviewQueueItem,
  EligibilityStatusView,
  ReviewUserEligibilityRequest,
} from '@irexpro/types/eligibility';
import type { ApiClient } from './index';

const DISCLOSURE_KEYS = new Set<EligibilityDisclosureKey>([
  'AUTOMATED_TRADING_RISK',
  'NO_PROFIT_GUARANTEE',
  'BROKER_EXECUTION_AUTHORITY',
  'LEGAL_ELIGIBILITY_ATTESTATION',
]);
const JURISDICTION_STATUSES = new Set([
  'MISSING_PROFILE',
  'REVIEW_REQUIRED',
  'ELIGIBLE',
  'INELIGIBLE',
]);
const DECISION_SOURCES = new Set(['POLICY', 'ADMIN_REVIEW']);
const SHA256 = /^[a-f0-9]{64}$/;
const COUNTRY = /^[A-Z]{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return actual.length === allowed.length && actual.every((key, index) => key === allowed[index]);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isDisclosureKey(value: unknown): value is EligibilityDisclosureKey {
  return typeof value === 'string' && DISCLOSURE_KEYS.has(value as EligibilityDisclosureKey);
}

function isDisclosure(value: unknown): value is EligibilityDisclosureView {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'key',
      'version',
      'title',
      'body',
      'contentSha256',
      'required',
    ])
  ) {
    return false;
  }
  return (
    isDisclosureKey(value.key) &&
    typeof value.version === 'string' &&
    value.version.length > 0 &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.body === 'string' &&
    value.body.length > 0 &&
    typeof value.contentSha256 === 'string' &&
    SHA256.test(value.contentSha256) &&
    value.required === true
  );
}

function isConsent(value: unknown): value is EligibilityConsentEvidenceView {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['key', 'version', 'contentSha256', 'acceptedAt'])
  ) {
    return false;
  }
  return (
    isDisclosureKey(value.key) &&
    typeof value.version === 'string' &&
    value.version.length > 0 &&
    typeof value.contentSha256 === 'string' &&
    SHA256.test(value.contentSha256) &&
    isIso(value.acceptedAt)
  );
}

export function isEligibilityStatusView(value: unknown): value is EligibilityStatusView {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'policyVersion',
      'countryCode',
      'jurisdictionStatus',
      'decisionSource',
      'reasonCode',
      'reviewedAt',
      'disclosures',
      'consents',
      'missingConsentKeys',
      'canProceed',
    ])
  ) {
    return false;
  }

  const countryValid = value.countryCode === null ||
    (typeof value.countryCode === 'string' && COUNTRY.test(value.countryCode));
  const reviewedAtValid = value.reviewedAt === null || isIso(value.reviewedAt);

  return (
    typeof value.policyVersion === 'string' &&
    value.policyVersion.length > 0 &&
    countryValid &&
    typeof value.jurisdictionStatus === 'string' &&
    JURISDICTION_STATUSES.has(value.jurisdictionStatus) &&
    typeof value.decisionSource === 'string' &&
    DECISION_SOURCES.has(value.decisionSource) &&
    typeof value.reasonCode === 'string' &&
    value.reasonCode.length > 0 &&
    reviewedAtValid &&
    Array.isArray(value.disclosures) &&
    value.disclosures.length === DISCLOSURE_KEYS.size &&
    value.disclosures.every(isDisclosure) &&
    new Set(value.disclosures.map((item) => item.key)).size === DISCLOSURE_KEYS.size &&
    Array.isArray(value.consents) &&
    value.consents.every(isConsent) &&
    Array.isArray(value.missingConsentKeys) &&
    value.missingConsentKeys.every(isDisclosureKey) &&
    typeof value.canProceed === 'boolean' &&
    value.canProceed ===
      (value.jurisdictionStatus === 'ELIGIBLE' && value.missingConsentKeys.length === 0)
  );
}

export function isEligibilityReviewQueueItem(value: unknown): value is EligibilityReviewQueueItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'userId',
      'email',
      'countryCode',
      'policyVersion',
      'jurisdictionStatus',
      'reasonCode',
    ]) &&
    typeof value.userId === 'string' &&
    value.userId.length > 0 &&
    (value.email === null || typeof value.email === 'string') &&
    typeof value.countryCode === 'string' &&
    COUNTRY.test(value.countryCode) &&
    typeof value.policyVersion === 'string' &&
    value.policyVersion.length > 0 &&
    value.jurisdictionStatus === 'REVIEW_REQUIRED' &&
    typeof value.reasonCode === 'string' &&
    value.reasonCode.length > 0
  );
}

function assertStatus(value: unknown): EligibilityStatusView {
  if (!isEligibilityStatusView(value)) {
    throw new Error('Eligibility response failed frontend-safe contract verification.');
  }
  return value;
}

function assertQueue(value: unknown): EligibilityReviewQueueItem[] {
  if (!Array.isArray(value) || !value.every(isEligibilityReviewQueueItem)) {
    throw new Error('Eligibility review queue failed frontend-safe contract verification.');
  }
  return value;
}

export interface EligibilityApi {
  getMyStatus(): Promise<EligibilityStatusView>;
  acceptDisclosures(body: AcceptEligibilityDisclosuresRequest): Promise<EligibilityStatusView>;
  listReviewQueue(): Promise<EligibilityReviewQueueItem[]>;
  reviewUser(userId: string, body: ReviewUserEligibilityRequest): Promise<EligibilityStatusView>;
}

/**
 * Eligibility/readiness client. All responses are exact-key verified before
 * they reach a browser. It records disclosure/review evidence only and exposes
 * no broker, risk-override, order, or execution method.
 */
export function createEligibilityApi(client: Pick<ApiClient, 'request'>): EligibilityApi {
  return {
    getMyStatus: async () => assertStatus(await client.request<unknown>('/users/me/eligibility')),
    acceptDisclosures: async (body) =>
      assertStatus(
        await client.request<unknown>('/users/me/eligibility/disclosures', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      ),
    listReviewQueue: async () =>
      assertQueue(await client.request<unknown>('/admin/eligibility/reviews')),
    reviewUser: async (userId, body) =>
      assertStatus(
        await client.request<unknown>(
          `/admin/eligibility/users/${encodeURIComponent(userId)}/review`,
          { method: 'POST', body: JSON.stringify(body) },
        ),
      ),
  };
}
