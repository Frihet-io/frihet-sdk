import type { HttpClient } from '../client.js';
import type {
  Expense, CreateExpenseParams, UpdateExpenseParams, ExpenseListParams,
  Page, BatchResult, RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

export class Expenses {
  constructor(private _client: HttpClient) {}

  list(params?: ExpenseListParams, opts?: RequestOptions): Promise<Page<Expense>> {
    return this._client.getPage('/expenses', params as Record<string, string | number | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Expense> {
    return this._client.get(`/expenses/${enc(id)}`, undefined, opts);
  }

  create(params: CreateExpenseParams, opts?: RequestOptions): Promise<Expense> {
    return this._client.post('/expenses', params, opts);
  }

  update(id: string, params: UpdateExpenseParams, opts?: RequestOptions): Promise<Expense> {
    return this._client.patch(`/expenses/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/expenses/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<ExpenseListParams, 'q'>, opts?: RequestOptions): Promise<Page<Expense>> {
    return this._client.getPage('/expenses', { q: query, ...params } as Record<string, string | number | undefined>, opts);
  }

  createBatch(items: CreateExpenseParams[], opts?: RequestOptions): Promise<BatchResult<Expense>> {
    return this._client.post('/expenses/batch', items, opts);
  }
}
