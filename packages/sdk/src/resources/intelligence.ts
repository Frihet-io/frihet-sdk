import type { HttpClient } from '../client.js';
import type {
  BusinessContext, MonthlySummary, QuarterlyTaxes, FinancialSummary,
  SummaryParams, RequestOptions,
} from '../types.js';

export class Intelligence {
  constructor(private _client: HttpClient) {}

  context(opts?: RequestOptions): Promise<BusinessContext> {
    return this._client.get('/context', undefined, opts);
  }

  summary(params?: SummaryParams, opts?: RequestOptions): Promise<FinancialSummary> {
    return this._client.get('/summary', params as Record<string, string | number | undefined>, opts);
  }

  monthly(month?: string, opts?: RequestOptions): Promise<MonthlySummary> {
    return this._client.get('/monthly', month ? { month } : undefined, opts);
  }

  quarterly(quarter?: string, opts?: RequestOptions): Promise<QuarterlyTaxes> {
    return this._client.get('/quarterly', quarter ? { quarter } : undefined, opts);
  }
}
