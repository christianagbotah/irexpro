import type {
  AcceptEligibilityDisclosuresRequest,
  EligibilityReviewQueueItem,
  EligibilityStatusView,
  ReviewUserEligibilityRequest,
} from '@irexpro/types/eligibility';
import type { ApiClient } from './index';

export interface EligibilityApi {
  getMyStatus(): Promise<EligibilityStatusView>;
  acceptDisclosures(body: AcceptEligibilityDisclosuresRequest): Promise<EligibilityStatusView>;
  listReviewQueue(): Promise<EligibilityReviewQueueItem[]>;
  reviewUser(userId: string, body: ReviewUserEligibilityRequest): Promise<EligibilityStatusView>;
}

/**
 * Eligibility/readiness client. It records disclosure/review evidence only;
 * it intentionally exposes no broker, risk-override, order, or execution method.
 */
export function createEligibilityApi(client: Pick<ApiClient, 'request'>): EligibilityApi {
  return {
    getMyStatus: () => client.request<EligibilityStatusView>('/users/me/eligibility'),
    acceptDisclosures: (body) =>
      client.request<EligibilityStatusView>('/users/me/eligibility/disclosures', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    listReviewQueue: () =>
      client.request<EligibilityReviewQueueItem[]>('/admin/eligibility/reviews'),
    reviewUser: (userId, body) =>
      client.request<EligibilityStatusView>(
        `/admin/eligibility/users/${encodeURIComponent(userId)}/review`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
  };
}
