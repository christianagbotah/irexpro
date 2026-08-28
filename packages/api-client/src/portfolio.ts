import type { PortfolioAccountView } from '@irexpro/types/portfolio';
import type { ApiClient } from './index';

export interface PortfolioApi {
  listAccounts(): Promise<PortfolioAccountView[]>;
}

/**
 * Typed read-only Portfolio Truth client layered on the shared transport.
 *
 * Browser/mobile clients receive sanitized persisted snapshots only. This API
 * intentionally contains no broker mutation methods and no local financial
 * calculations.
 */
export function createPortfolioApi(
  client: Pick<ApiClient, 'request'>,
): PortfolioApi {
  return {
    listAccounts: () => client.request<PortfolioAccountView[]>('/portfolio/accounts'),
  };
}
