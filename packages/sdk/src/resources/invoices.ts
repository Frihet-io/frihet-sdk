import type { HttpClient } from '../client.js';
import type {
  Invoice, CreateInvoiceParams, UpdateInvoiceParams, InvoiceListParams,
  SendInvoiceParams, MarkPaidResult, SendResult, Page, BatchResult, RequestOptions,
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

  createBatch(items: CreateInvoiceParams[], opts?: RequestOptions): Promise<BatchResult<Invoice>> {
    return this._client.post('/invoices/batch', items, opts);
  }
}
