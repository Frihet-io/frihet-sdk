import type { HttpClient } from '../client.js';
import type {
  Deposit,
  DepositListParams,
  CreateDepositParams,
  DepositApplyParams,
  DepositApplyResult,
  DepositRefundParams,
  DepositRefundResult,
  Page,
  RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

/**
 * Deposits resource — customer deposits / down-payments (MONEY MOVEMENT).
 *
 * CRUD on /v1/deposits plus the actions POST /v1/deposits/:id/apply
 * (publicApi.ts:4243) and POST /v1/deposits/:id/refund (publicApi.ts:4285).
 */
export class Deposits {
  constructor(private readonly _client: HttpClient) {}

  list(params?: DepositListParams, opts?: RequestOptions): Promise<Page<Deposit>> {
    return this._client.getPage('/deposits', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Deposit> {
    return this._client.get(`/deposits/${enc(id)}`, undefined, opts);
  }

  create(params: CreateDepositParams, opts?: RequestOptions): Promise<Deposit> {
    return this._client.post('/deposits', params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/deposits/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<DepositListParams, 'q'>, opts?: RequestOptions): Promise<Page<Deposit>> {
    return this._client.getPage('/deposits', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }

  /**
   * Apply a deposit against an invoice. All three fields are MANDATORY
   * (server schema is `.strict()`). The returned `appliedAmount` is the amount
   * applied in THIS call, not the cumulative `Deposit.appliedAmount`.
   */
  apply(id: string, params: DepositApplyParams, opts?: RequestOptions): Promise<DepositApplyResult> {
    return this._client.post(`/deposits/${enc(id)}/apply`, params, opts);
  }

  /**
   * Refund a deposit (full or partial). Omit `params.amount` to refund the
   * entire remaining balance. No other field is accepted (`.strict()` schema).
   */
  refund(id: string, params?: DepositRefundParams, opts?: RequestOptions): Promise<DepositRefundResult> {
    return this._client.post(`/deposits/${enc(id)}/refund`, params, opts);
  }
}
