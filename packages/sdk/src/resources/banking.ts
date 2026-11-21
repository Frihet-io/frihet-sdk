import type { HttpClient } from '../client.js';
import type { Page, RequestOptions } from '../types.js';
import type {
  BankAccount,
  BankAccountListParams,
  BankTransaction,
  BankTransactionListParams,
  BankTransactionSuggestionsParams,
  BankTransactionSuggestionsResult,
  CategorizeBankTransactionParams,
  CreateBankTransactionParams,
  MatchBankTransactionParams,
} from '../types/banking.js';

const enc = encodeURIComponent;

/**
 * Canonical Banking REST resource (`/v1/banking/*`).
 *
 * Accounts map to connected `bankConnections` in the authenticated workspace;
 * transactions map to `bankTransactions`. Match links a transaction to an
 * invoice or expense without posting GL entries.
 */
export class Banking {
  constructor(private readonly _client: HttpClient) {}

  /** List connected bank accounts (`GET /v1/banking/accounts`). */
  listAccounts(
    params?: BankAccountListParams,
    opts?: RequestOptions,
  ): Promise<Page<BankAccount>> {
    return this._client.getPage(
      '/banking/accounts',
      params as Record<string, string | number | boolean | undefined>,
      opts,
    );
  }

  /** Retrieve a single connected bank account (`GET /v1/banking/accounts/:accountId`). */
  retrieveAccount(accountId: string, opts?: RequestOptions): Promise<BankAccount> {
    return this._client.get(`/banking/accounts/${enc(accountId)}`, undefined, opts);
  }

  /** List bank transactions with optional filters (`GET /v1/banking/transactions`). */
  listTransactions(
    params?: BankTransactionListParams,
    opts?: RequestOptions,
  ): Promise<Page<BankTransaction>> {
    return this._client.getPage(
      '/banking/transactions',
      params as Record<string, string | number | boolean | undefined>,
      opts,
    );
  }

  /** Retrieve a single bank transaction (`GET /v1/banking/transactions/:transactionId`). */
  retrieveTransaction(transactionId: string, opts?: RequestOptions): Promise<BankTransaction> {
    return this._client.get(`/banking/transactions/${enc(transactionId)}`, undefined, opts);
  }

  /**
   * Manually create a bank transaction attached to a workspace-owned account
   * (`POST /v1/banking/transactions`). Reconciliation state is force-initialised
   * server-side (`reconciled: false`, `status: 'raw'`).
   */
  createTransaction(
    params: CreateBankTransactionParams,
    opts?: RequestOptions,
  ): Promise<BankTransaction> {
    return this._client.post('/banking/transactions', params, opts);
  }

  /**
   * Set the category (and optional notes) on a bank transaction
   * (`PATCH /v1/banking/transactions/:transactionId/categorize`).
   */
  categorizeTransaction(
    transactionId: string,
    params: CategorizeBankTransactionParams,
    opts?: RequestOptions,
  ): Promise<BankTransaction> {
    return this._client.patch(
      `/banking/transactions/${enc(transactionId)}/categorize`,
      params,
      opts,
    );
  }

  /**
   * Link a bank transaction to an invoice or expense in the same workspace
   * (`POST /v1/banking/transactions/:transactionId/match`). Fails with 409
   * (`ConflictError`) when the transaction is already matched/reconciled.
   */
  matchTransaction(
    transactionId: string,
    params: MatchBankTransactionParams,
    opts?: RequestOptions,
  ): Promise<BankTransaction> {
    return this._client.post(
      `/banking/transactions/${enc(transactionId)}/match`,
      params,
      opts,
    );
  }

  /**
   * Read-only ranked reconciliation candidates for a bank transaction
   * (`GET /v1/banking/transactions/:transactionId/suggestions`).
   */
  transactionSuggestions(
    transactionId: string,
    params?: BankTransactionSuggestionsParams,
    opts?: RequestOptions,
  ): Promise<BankTransactionSuggestionsResult> {
    return this._client.get(
      `/banking/transactions/${enc(transactionId)}/suggestions`,
      params as Record<string, string | number | boolean | undefined>,
      opts,
    );
  }
}
