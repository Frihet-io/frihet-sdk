import type { HttpClient } from '../client.js';

/**
 * Deposits resource — customer deposits / down-payments (MONEY MOVEMENT).
 *
 * STAGE 1 SCAFFOLD: method bodies are added by the per-resource agent in the
 * next stage. Endpoints (publicApi.ts): CRUD on /v1/deposits plus the actions
 * POST /v1/deposits/:id/apply (publicApi.ts:4243) and
 * POST /v1/deposits/:id/refund (publicApi.ts:4285).
 *
 * Types are ready in ../types.ts: Deposit, DepositListParams, CreateDepositParams,
 * DepositApplyParams, DepositApplyResult, DepositRefundParams, DepositRefundResult.
 */
export class Deposits {
  // Held for the next-stage resource methods (CRUD + apply/refund).
  constructor(protected readonly _client: HttpClient) {}
}
