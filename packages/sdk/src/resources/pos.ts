import type { HttpClient } from '../client.js';
import type {
  PosTerminal,
  PosTerminalListParams,
  PosSale,
  PosSaleListParams,
  CreatePosSaleParams,
  PosSaleCreateResult,
  RefundPosSaleParams,
  PosSaleRefundResult,
  CloseCashSessionParams,
  CashSessionCloseResult,
  Page,
  RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

/**
 * Point of Sale (POS) REST resource (`/v1/pos/*`).
 *
 * Mirrors the exact live routes served by `functions/src/publicApi/families/pos.ts`:
 *  - `GET  /v1/pos/terminals`
 *  - `GET  /v1/pos/sales`
 *  - `GET  /v1/pos/sales/:id`
 *  - `POST /v1/pos/sales`
 *  - `POST /v1/pos/sales/:id/refund`
 *  - `POST /v1/pos/cash-sessions/:id/close`
 *
 * POS money mutations (`createSale`, `refundSale`, `closeCashSession`) are
 * Trust Area operations: they require an API key with POS write scope plus
 * explicit workspace POS money authority, and `createSale`/`refundSale` require
 * `Idempotency-Key` alignment with `clientReferenceId`.
 */
export class Pos {
  constructor(private readonly _client: HttpClient) {}

  /** List active POS terminals (`GET /v1/pos/terminals`). */
  listTerminals(
    params?: PosTerminalListParams,
    opts?: RequestOptions,
  ): Promise<Page<PosTerminal>> {
    return this._client.getPage(
      '/pos/terminals',
      params as Record<string, string | number | boolean | undefined>,
      opts,
    );
  }

  /** List active POS sales (`GET /v1/pos/sales`). */
  listSales(
    params?: PosSaleListParams,
    opts?: RequestOptions,
  ): Promise<Page<PosSale>> {
    return this._client.getPage(
      '/pos/sales',
      params as Record<string, string | number | boolean | undefined>,
      opts,
    );
  }

  /** Retrieve a single POS sale (`GET /v1/pos/sales/:id`). */
  retrieveSale(id: string, opts?: RequestOptions): Promise<PosSale> {
    return this._client.get(`/pos/sales/${enc(id)}`, undefined, opts);
  }

  /**
   * Finalise a counter sale (`POST /v1/pos/sales`).
   *
   * When `params.clientReferenceId` is supplied without `opts.idempotencyKey`,
   * it is forwarded as the `Idempotency-Key` header so server-side binding succeeds.
   */
  createSale(
    params: CreatePosSaleParams,
    opts?: RequestOptions,
  ): Promise<PosSaleCreateResult> {
    const reqOpts: RequestOptions | undefined =
      params.clientReferenceId && !opts?.idempotencyKey
        ? { ...opts, idempotencyKey: params.clientReferenceId }
        : opts;
    return this._client.post('/pos/sales', params, reqOpts);
  }

  /**
   * Issue a full or partial refund for a POS sale (`POST /v1/pos/sales/:id/refund`).
   *
   * Always sends a JSON object body (empty `{}` when `params` is omitted) as
   * required by `bindClientReferenceId` on the backend.
   */
  refundSale(
    id: string,
    params?: RefundPosSaleParams,
    opts?: RequestOptions,
  ): Promise<PosSaleRefundResult> {
    const body = params ?? {};
    const reqOpts: RequestOptions | undefined =
      params?.clientReferenceId && !opts?.idempotencyKey
        ? { ...opts, idempotencyKey: params.clientReferenceId }
        : opts;
    return this._client.post(`/pos/sales/${enc(id)}/refund`, body, reqOpts);
  }

  /**
   * Close a cash session, reconcile counts, and write the fiscal Z-report
   * (`POST /v1/pos/cash-sessions/:id/close`).
   */
  closeCashSession(
    id: string,
    params: CloseCashSessionParams,
    opts?: RequestOptions,
  ): Promise<CashSessionCloseResult> {
    return this._client.post(`/pos/cash-sessions/${enc(id)}/close`, params, opts);
  }
}
