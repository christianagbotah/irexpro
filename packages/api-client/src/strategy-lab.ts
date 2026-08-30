import type { StrategyLabView } from '@irexpro/types/strategy-lab';
import type { ApiClient } from './index';

export interface StrategyLabApi {
  getSnapshot(): Promise<StrategyLabView>;
}

/**
 * Read-only Strategy Lab client. No live execution, risk override, broker
 * mutation, or signal-submission methods are exposed from this subpath.
 */
export function createStrategyLabApi(client: Pick<ApiClient, 'request'>): StrategyLabApi {
  return {
    getSnapshot: () => client.request<StrategyLabView>('/strategy/lab'),
  };
}
