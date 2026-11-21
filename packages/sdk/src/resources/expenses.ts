import type { HttpClient } from '../client.js';
import type {
  Expense,
  CreateExpenseParams,
  UpdateExpenseParams,
  ExpenseListParams,
  CreateExpenseAttachmentUploadParams,
  ExpenseAttachmentUpload,
  AddExpenseAttachmentParams,
  AddExpenseAttachmentResult,
  MarkExpenseBillableParams,
  MarkExpenseBillableResult,
  UnmarkExpenseBillableResult,
  Page,
  BatchResult,
  RequestOptions,
} from '../types.js';

const enc = encodeURIComponent;

export class Expenses {
  constructor(private _client: HttpClient) {}

  list(params?: ExpenseListParams, opts?: RequestOptions): Promise<Page<Expense>> {
    return this._client.getPage('/expenses', params as Record<string, string | number | boolean | undefined>, opts);
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
    return this._client.getPage('/expenses', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }

  createBatch(items: CreateExpenseParams[], opts?: RequestOptions): Promise<BatchResult<Expense>> {
    return this._client.post('/expenses/batch', items, opts);
  }

  /**
   * Prepare a metadata-only attachment upload reference
   * (`POST /v1/expenses/attachments/uploads`).
   *
   * Returns an opaque `fileReferenceId` + size/MIME limits to link via
   * {@link addAttachment} after uploading the file externally.
   */
  createAttachmentUpload(
    params: CreateExpenseAttachmentUploadParams,
    opts?: RequestOptions,
  ): Promise<ExpenseAttachmentUpload> {
    return this._client.post('/expenses/attachments/uploads', params, opts);
  }

  /**
   * Attach an existing opaque file reference to an expense
   * (`POST /v1/expenses/:expenseId/attachments`).
   *
   * To read existing attachments for an expense, call {@link retrieve} and
   * inspect `expense.attachments`.
   */
  addAttachment(
    expenseId: string,
    params: AddExpenseAttachmentParams,
    opts?: RequestOptions,
  ): Promise<AddExpenseAttachmentResult> {
    return this._client.post(`/expenses/${enc(expenseId)}/attachments`, params, opts);
  }

  /**
   * Mark an unbilled expense as billable to a client, optionally with a markup
   * percentage (`POST /v1/expenses/:expenseId/billable`).
   */
  markBillable(
    expenseId: string,
    params: MarkExpenseBillableParams,
    opts?: RequestOptions,
  ): Promise<MarkExpenseBillableResult> {
    return this._client.post(`/expenses/${enc(expenseId)}/billable`, params, opts);
  }

  /**
   * Remove the billable flag from an unbilled expense
   * (`DELETE /v1/expenses/:expenseId/billable`).
   */
  unmarkBillable(
    expenseId: string,
    opts?: RequestOptions,
  ): Promise<UnmarkExpenseBillableResult> {
    return this._client.del(`/expenses/${enc(expenseId)}/billable`, opts);
  }
}
