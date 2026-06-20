import type { HttpClient } from '../client.js';

/**
 * Gestoria resource — accountant-facing consolidated receivables aging across
 * multiple client workspaces. POST /v1/gestoria/aging (publicApi.ts:3397).
 * The server silently rejects workspaces the caller is not a member of and
 * lists them in `rejectedWorkspaceIds` — never returning unauthorised data.
 *
 * STAGE 1 SCAFFOLD: method bodies are added by the per-resource agent next stage.
 * Types are ready in ../types.ts: GestoriaAgingParams, ConsolidatedAgingReport,
 * WorkspaceAgingSummary, AgingBuckets, TopDebtor.
 */
export class Gestoria {
  // Held for the next-stage resource method (POST /gestoria/aging).
  constructor(protected readonly _client: HttpClient) {}
}
