import type { RiskIntelligenceView } from '@irexpro/types/risk-intelligence';
import type { ApiClient } from './index';

export interface RiskIntelligenceApi {
  getSnapshot(): Promise<RiskIntelligenceView>;
}

/**
 * Read-only client for portfolio/risk intelligence.
 *
 * No profile mutation, kill-switch toggle, execution, or order-placement methods
 * are exposed from this subpath.
 */
export function createRiskIntelligenceApi(
  client: Pick<ApiClient, 'request'>,
): RiskIntelligenceApi {
  return {
    getSnapshot: () => client.request<RiskIntelligenceView>('/risk/intelligence'),
  };
}
