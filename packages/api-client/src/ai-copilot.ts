import type { AiCopilotRequest, AiCopilotView } from '@irexpro/types/ai-copilot';
import type { ApiClient } from './index';

export interface AiCopilotApi {
  getContext(request: AiCopilotRequest): Promise<AiCopilotView>;
}

/** Read-only Copilot client. No broker, risk, or execution mutation methods. */
export function createAiCopilotApi(client: Pick<ApiClient, 'request'>): AiCopilotApi {
  return {
    getContext: ({ instrument, timeframe }) => {
      const params = new URLSearchParams({ instrument, timeframe });
      return client.request<AiCopilotView>(`/ai/copilot/context?${params.toString()}`);
    },
  };
}
