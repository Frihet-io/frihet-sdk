/**
 * Banking types — Bank transactions, exceptions, rules.
 *
 * Mirrors `apps/erp/services/bankRulesService.ts` (BankRule, BankRuleCondition)
 * and the bank exception workflow shipped in D2-BANK1 / D2-BANK2.
 */

// ---------------------------------------------------------------------------
// Bank transactions (lean shape — full transactions live behind /v1/bank/...)
// ---------------------------------------------------------------------------

export interface BankTransaction {
  id: string;
  /** ISO date: YYYY-MM-DD */
  date: string;
  description: string;
  /** Counterparty name (creditor or debtor) when present. */
  counterparty?: string;
  reference?: string;
  /** Amount in EUR. Positive = credit to account, negative = debit. */
  amount: number;
  currency?: string;
  accountId?: string;
  /** ISO datetime */
  createdAt?: string;
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
