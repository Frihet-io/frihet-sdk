import type { HttpClient } from '../client.js';
import type {
  Quote, CreateQuoteParams, UpdateQuoteParams, QuoteListParams,
  Page, RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

export class Quotes {
  constructor(private _client: HttpClient) {}

  list(params?: QuoteListParams, opts?: RequestOptions): Promise<Page<Quote>> {
    return this._client.getPage('/quotes', params as Record<string, string | number | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Quote> {
    return this._client.get(`/quotes/${enc(id)}`, undefined, opts);
  }

  create(params: CreateQuoteParams, opts?: RequestOptions): Promise<Quote> {
    return this._client.post('/quotes', params, opts);
  }

  update(id: string, params: UpdateQuoteParams, opts?: RequestOptions): Promise<Quote> {
    return this._client.patch(`/quotes/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/quotes/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<QuoteListParams, 'q'>, opts?: RequestOptions): Promise<Page<Quote>> {
    return this._client.getPage('/quotes', { q: query, ...params } as Record<string, string | number | undefined>, opts);
  }

  pdf(id: string, opts?: RequestOptions): Promise<ArrayBuffer> {
    return this._client.getRaw(`/quotes/${enc(id)}/pdf`, opts);
  }

  send(id: string, params: { recipientEmail: string; recipientName?: string; customMessage?: string; locale?: 'es' | 'en' }, opts?: RequestOptions): Promise<{ success: boolean; messageId: string }> {
    return this._client.post(`/quotes/${enc(id)}/send`, params, opts);
  }
}
