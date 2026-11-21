import type { HttpClient } from '../client.js';
import type {
  Invoice, CreateInvoiceParams, UpdateInvoiceParams, InvoiceListParams,
  SendInvoiceParams, MarkPaidResult, SendResult, Page, BatchResult, RequestOptions,
  CreateCreditNoteParams, CreditNoteResult, LateFeeParams, LateFeeResult,
  EInvoiceExportParams, EInvoiceExportResult,
  FaceSubmitParams, FaceSubmitResult, FaceStatusResult,
  TicketBaiSubmitParams, TicketBaiSubmitResult, TicketBaiStatusResult,
} from '../types.js';

const enc = encodeURIComponent;

export class Invoices {
  constructor(private _client: HttpClient) {}

  list(params?: InvoiceListParams, opts?: RequestOptions): Promise<Page<Invoice>> {
    return this._client.getPage('/invoices', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Invoice> {
    return this._client.get(`/invoices/${enc(id)}`, undefined, opts);
  }

  create(params: CreateInvoiceParams, opts?: RequestOptions): Promise<Invoice> {
    return this._client.post('/invoices', params, opts);
  }

  update(id: string, params: UpdateInvoiceParams, opts?: RequestOptions): Promise<Invoice> {
    return this._client.patch(`/invoices/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/invoices/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<InvoiceListParams, 'q'>, opts?: RequestOptions): Promise<Page<Invoice>> {
    return this._client.getPage('/invoices', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }

  markPaid(id: string, paidDate?: string, opts?: RequestOptions): Promise<MarkPaidResult> {
    return this._client.post(`/invoices/${enc(id)}/paid`, paidDate ? { paidDate } : undefined, opts);
  }

  send(id: string, params: SendInvoiceParams, opts?: RequestOptions): Promise<SendResult> {
    return this._client.post(`/invoices/${enc(id)}/send`, params, opts);
  }

  pdf(id: string, opts?: RequestOptions): Promise<ArrayBuffer> {
    return this._client.getRaw(`/invoices/${enc(id)}/pdf`, opts);
  }

  /**
   * Download the stored e-invoice artifact (`GET /v1/invoices/:id/xml`).
   * Returns raw bytes (`application/xml` for Facturae/UBL/CII or
   * `application/pdf` for Factur-X PDF/A-3). Throws 404 when no artifact has
   * been generated yet.
   */
  xml(id: string, opts?: RequestOptions): Promise<ArrayBuffer> {
    return this._client.getRaw(`/invoices/${enc(id)}/xml`, opts);
  }

  /**
   * Generate and return an e-invoice XML in one of the 9 supported EN 16931
   * formats (`POST /v1/invoices/:id/einvoice/export`).
   * Requires `einvoice:*` scope plus `write` or `einvoice:write`.
   */
  exportEInvoice(id: string, params: EInvoiceExportParams, opts?: RequestOptions): Promise<EInvoiceExportResult> {
    return this._client.post(`/invoices/${enc(id)}/einvoice/export`, params, opts);
  }

  /**
   * Submit a signed Facturae XML to Spain's FACe B2G portal
   * (`POST /v1/invoices/:id/face/submit`).
   * Idempotent: returns the prior accepted registration with `idempotent: true`
   * if already registered. Requires `einvoice:*` plus `write` or `einvoice:write`.
   */
  submitFace(id: string, params?: FaceSubmitParams, opts?: RequestOptions): Promise<FaceSubmitResult> {
    return this._client.post(`/invoices/${enc(id)}/face/submit`, params, opts);
  }

  /**
   * Query the current FACe tramitación status for a submitted invoice
   * (`GET /v1/invoices/:id/face/status`). Requires `einvoice:*` scope.
   */
  faceStatus(id: string, opts?: RequestOptions): Promise<FaceStatusResult> {
    return this._client.get(`/invoices/${enc(id)}/face/status`, undefined, opts);
  }

  /**
   * Build, sign, and run the TicketBAI submission pipeline for an invoice
   * (`POST /v1/invoices/:id/ticketbai/submit`).
   * Idempotent: returns the prior accepted result with `idempotent: true` if
   * already accepted. Requires `einvoice:*` plus `write` or `einvoice:write`.
   */
  submitTicketBai(id: string, params?: TicketBaiSubmitParams, opts?: RequestOptions): Promise<TicketBaiSubmitResult> {
    return this._client.post(`/invoices/${enc(id)}/ticketbai/submit`, params, opts);
  }

  /**
   * Read the stored TicketBAI submission status for an invoice
   * (`GET /v1/invoices/:id/ticketbai/status`). Requires `einvoice:*` scope.
   */
  ticketBaiStatus(id: string, opts?: RequestOptions): Promise<TicketBaiStatusResult> {
    return this._client.get(`/invoices/${enc(id)}/ticketbai/status`, undefined, opts);
  }

  /**
   * Create a credit note (factura rectificativa) against an issued invoice.
   * The invoice must NOT be in `draft` or `cancelled` state (409/400 otherwise).
   */
  creditNote(id: string, params: CreateCreditNoteParams, opts?: RequestOptions): Promise<CreditNoteResult> {
    return this._client.post(`/invoices/${enc(id)}/credit-note`, params, opts);
  }

  /**
   * Apply a late fee to an overdue (or sent) invoice. Omit `params.amount` to
   * let the server auto-calculate using the EU Late Payment Directive rate.
   */
  lateFee(id: string, params?: LateFeeParams, opts?: RequestOptions): Promise<LateFeeResult> {
    return this._client.post(`/invoices/${enc(id)}/late-fee`, params, opts);
  }

  createBatch(items: CreateInvoiceParams[], opts?: RequestOptions): Promise<BatchResult<Invoice>> {
    return this._client.post('/invoices/batch', items, opts);
  }
}
