import type { HttpClient } from '../client.js';
import type {
  GlobalSearchParams,
  GlobalSearchResponse,
  RequestOptions,
} from '../types.js';

/**
 * Workspace-scoped global search (`/v1/search/*`).
 */
export class Search {
  constructor(private readonly _client: HttpClient) {}

  /**
   * Bounded read-only search across invoices, expenses, vendors, clients, and
   * products (`GET /v1/search/global`).
   *
   * `query` must be non-empty and at most 200 characters (enforced server-side).
   */
  global(
    query: string,
    params?: GlobalSearchParams,
    opts?: RequestOptions,
  ): Promise<GlobalSearchResponse> {
    const types = Array.isArray(params?.types)
      ? params.types.join(',')
      : params?.types;
    return this._client.get<GlobalSearchResponse>(
      '/search/global',
      {
        q: query,
        ...(types !== undefined ? { types } : {}),
        ...(params?.limit !== undefined ? { limit: params.limit } : {}),
        ...(params?.offset !== undefined ? { offset: params.offset } : {}),
      },
      opts,
    );
  }
}
