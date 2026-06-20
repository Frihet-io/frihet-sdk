import type { HttpClient } from '../client.js';
import type {
  GestoriaAgingParams,
  ConsolidatedAgingReport,
  RequestOptions,
} from '../types.js';

/**
 * Gestoria resource — accountant-facing consolidated receivables aging across
 * multiple client workspaces. POST /v1/gestoria/aging (publicApi.ts:3397).
 * The server silently rejects workspaces the caller is not a member of and
 * lists them in `rejectedWorkspaceIds` — never returning unauthorised data.
 */
export class Gestoria {
  constructor(private readonly _client: HttpClient) {}

  /**
   * Build a consolidated receivables aging report across the given workspaces.
   * Workspaces the caller is not a member of are silently rejected and listed
   * in `rejectedWorkspaceIds`. `workspaceIds` must hold 1–200 ids.
   */
  aging(params: GestoriaAgingParams, opts?: RequestOptions): Promise<ConsolidatedAgingReport> {
    return this._client.post('/gestoria/aging', params, opts);
  }
}
