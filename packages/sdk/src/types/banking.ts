/**
 * Banking types — Bank transactions, exceptions, rules.
 *
 * Mirrors `apps/erp/services/bankRulesService.ts` (BankRule, BankRuleCondition)
 * and the bank exception workflow shipped in D2-BANK1 / D2-BANK2.
 */

// ---------------------------------------------------------------------------
// Bank accounts & transactions (/v1/banking/*)
// ---------------------------------------------------------------------------

export interface BankCounterparty {
  name: string;
  accountNumber?: string;
  iban?: string;
}

export type BankTransactionStatus =
  | 'raw'
  | 'recognized'
  | 'matched'
  | 'categorized'
  | 'excluded';

export interface BankMatchedReference {
  referenceType: 'invoice' | 'expense';
  referenceId: string;
  amount: number;
}

/**
 * Connected bank account (backed by the `bankConnections` collection).
 * Mirrors GET /v1/banking/accounts and GET /v1/banking/accounts/:accountId.
 */
export interface BankAccount {
  id: string;
  /** saltedge | tink | truelayer | yodlee | revolut | manual */
  provider: string | null;
  bankName: string | null;
  accountName: string | null;
  /** Last 4 digits for display. */
  accountNumber: string | null;
  /** Masked IBAN. */
  iban: string | null;
  currency: string | null;
  isActive: boolean;
  /** ISO datetime */
  lastSyncAt: string | null;
  /** ISO datetime */
  createdAt: string | null;
  /** ISO datetime */
  updatedAt: string | null;
}

export interface BankAccountListParams {
  provider?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface BankTransaction {
  id: string;
  /** ID of the owning bank account (connection). */
  connectionId?: string;
  /** Provider transaction ID (`manual-*` for API-created entries). */
  transactionId?: string;
  /** ISO date: YYYY-MM-DD */
  date: string;
  description: string;
  /**
   * Counterparty details (`BankCounterparty` from `/v1/banking/transactions`,
   * or a plain string in lean D4-C snapshots).
   */
  counterparty?: BankCounterparty | string | null;
  reference?: string | null;
  category?: string | null;
  categoryNotes?: string;
  /** Amount in account currency. Positive = income/credit, negative = expense/debit. */
  amount: number;
  currency?: string;
  /** Legacy alias for `connectionId`. */
  accountId?: string;
  reconciled?: boolean;
  reconciledWith?: 'invoice' | 'expense' | null;
  reconciledId?: string | null;
  /** ISO datetime */
  reconciledAt?: string | null;
  status?: BankTransactionStatus;
  source?: string | null;
  createdVia?: string;
  matchedVia?: string;
  matchNotes?: string;
  matchedReferences?: BankMatchedReference[];
  /** ISO datetime */
  createdAt?: string | null;
  /** ISO datetime */
  updatedAt?: string | null;
}

export interface BankTransactionListParams {
  /** Filter by bank account (connection) ID. */
  accountId?: string;
  /** Start date (ISO YYYY-MM-DD). */
  from?: string;
  /** End date (ISO YYYY-MM-DD). */
  to?: string;
  status?: BankTransactionStatus;
  category?: string;
  reconciled?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Body for POST /v1/banking/transactions (`.strict()` Zod schema).
 * Reconciliation state is force-initialised server-side (`reconciled: false`,
 * `status: 'raw'`).
 */
export interface CreateBankTransactionParams {
  /** Owning bank account (connection) ID in the caller's workspace. */
  accountId: string;
  /** Non-zero finite number. Positive = income, negative = expense. */
  amount: number;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  description: string;
  /** ISO 4217 3-letter currency code. Defaults to account currency or EUR. */
  currency?: string;
  reference?: string;
  category?: string;
  counterparty?: BankCounterparty;
}

/** Body for PATCH /v1/banking/transactions/:transactionId/categorize (`.strict()`). */
export interface CategorizeBankTransactionParams {
  category: string;
  notes?: string;
}

/** Body for POST /v1/banking/transactions/:transactionId/match (`.strict()`). */
export interface MatchBankTransactionParams {
  documentId: string;
  documentType: 'invoice' | 'expense';
  notes?: string;
}

export type ReconciliationSuggestionSignal =
  | 'amount'
  | 'date'
  | 'reference'
  | 'counterparty';

export interface ReconciliationSuggestionBreakdown {
  signal: ReconciliationSuggestionSignal;
  points: number;
  similarity: number;
  reason: string;
}

export interface ReconciliationSuggestion {
  documentType: 'invoice' | 'expense';
  documentId: string;
  score: number;
  confidence: number;
  suggested: boolean;
  amountDiff: number;
  dateDiff: number;
  reasons: string[];
  breakdown: ReconciliationSuggestionBreakdown[];
}

export interface BankTransactionSuggestionsParams {
  /** Maximum candidates to return (1-10, default 5). */
  limit?: number;
}

export interface BankTransactionSuggestionsResult {
  transactionId: string;
  limit: number;
  suggestions: ReconciliationSuggestion[];
}

// ---------------------------------------------------------------------------
// Bank exceptions (D2-BANK1)
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a bank reconciliation exception.
 *  - `unmatched`    — Transaction has no candidate match yet.
 *  - `needs_review` — One or more candidates surfaced; user decision required.
 *  - `matched`      — Linked to an invoice/expense via the reconciler.
 *  - `excluded`     — Manually excluded from reconciliation (internal transfer, etc.).
 *  - `categorized`  — Categorized via a rule but not bound to a specific document.
 */
export type BankExceptionStatus =
  | 'unmatched'
  | 'needs_review'
  | 'matched'
  | 'excluded'
  | 'categorized';

export interface BankException {
  id: string;
  transactionId: string;
  /** Snapshot of the transaction for offline review. */
  transaction: BankTransaction;
  status: BankExceptionStatus;
  /** When status === 'matched', the linked invoice or expense id. */
  matchedDocumentId?: string;
  matchedDocumentType?: 'invoice' | 'expense' | 'credit_note';
  /** When status === 'needs_review', the candidates surfaced by the reconciler. */
  candidates?: Array<{
    documentId: string;
    documentType: 'invoice' | 'expense' | 'credit_note';
    score: number;
    reason?: string;
  }>;
  /** Free-text explanation set when status === 'excluded'. */
  exclusionReason?: string;
  resolvedBy?: string;
  /** ISO datetime */
  resolvedAt?: string;
  /** ISO datetime */
  createdAt: string;
  /** ISO datetime */
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Bank rules (D2-BANK2)
// ---------------------------------------------------------------------------

export type BankRuleConditionField = 'description' | 'reference' | 'amount' | 'counterparty';

export type BankRuleConditionOperator =
  | 'contains'
  | 'equals'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'regex';

/**
 * Condition evaluated against a bank transaction by the new rules engine.
 * Mirrors `BankRuleCondition` in apps/erp/services/bankRulesService.ts.
 */
export interface BankRuleCondition {
  field: BankRuleConditionField;
  operator: BankRuleConditionOperator;
  value: string;
  /** Upper bound for the `between` operator. */
  valueTo?: string;
}

export type BankRuleActionType =
  | 'categorize_expense'
  | 'match_invoice'
  | 'match_client'
  | 'ignore'
  | 'create_expense'
  | 'flag_review';

export interface BankRuleActionConfig {
  category?: string;
  clientId?: string;
  accountId?: string;
  expenseDefaults?: {
    vendor?: string;
    category?: string;
    taxRate?: number;
    description?: string;
  };
  flag?: string;
}

/**
 * Bank rule. Mirrors `BankRule` in apps/erp/services/bankRulesService.ts.
 *
 * The SDK exposes the new-engine shape (conditions on bank transactions,
 * single primary action). Legacy expense-matching rules remain server-side
 * and are not part of the public SDK surface.
 */
export interface BankRule {
  id: string;
  name: string;
  /** Higher = checked first. */
  priority: number;
  isActive: boolean;
  conditions: BankRuleCondition[];
  /** How to combine conditions when there are multiple. */
  conditionLogic?: 'and' | 'or';
  action: BankRuleActionType;
  actionConfig?: BankRuleActionConfig;
  /** Whether matched transactions are auto-applied without user confirmation. */
  autoApply?: boolean;
  /** Number of transactions this rule has been applied to. */
  timesApplied?: number;
  /** ISO datetime */
  lastAppliedAt?: string;
  /** ISO datetime */
  createdAt: string;
  /** ISO datetime */
  updatedAt: string;
}

export type CreateBankRuleParams = Omit<
  BankRule,
  'id' | 'timesApplied' | 'lastAppliedAt' | 'createdAt' | 'updatedAt'
>;

export interface BankRuleSimulateResult {
  /** Number of past transactions this rule would have matched. */
  matched: number;
  /** Sample of matched transactions (typically the 10 most recent). */
  sample: BankTransaction[];
}
