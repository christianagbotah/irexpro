import type { AiDecisionExplorerView } from '@irexpro/types/ai-decision-explorer';
import type { ApiClient } from './index';

export interface AiDecisionExplorerApi {
  getRecentDecisions(): Promise<AiDecisionExplorerView>;
}

/**
 * Read-only client for persisted AI decision evidence.
 *
 * No signal submission, risk override, trade execution, broker mutation, or
 * model-control methods are exposed from this subpath.
 */
export function createAiDecisionExplorerApi(
  client: Pick<ApiClient, 'request'>,
): AiDecisionExplorerApi {
  return {
    getRecentDecisions: () => client.request<AiDecisionExplorerView>('/ai/decisions'),
  };
}
