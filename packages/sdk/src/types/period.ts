/**
 * Period close types (D3-T4).
 *
 * A period close locks a fiscal period (typically a month or a VAT quarter)
 * so no further writes to invoices/expenses dated inside it are allowed.
 * Mirrors the server-side `periodClosed` taxonomy used by firestore.rules
 * and Cloud Functions to reject mutations after close.
 */

export type PeriodCloseStatus = 'open' | 'in_progress' | 'closed' | 'reopened';

export type PeriodGranularity = 'month' | 'quarter' | 'year';

export interface PeriodClose {
  id: string;
  /** Granularity of the period. */
  granularity: PeriodGranularity;
  /** Period identifier — `2026-03` (month), `2026-Q1` (quarter), `2026` (year). */
  period: string;
  /** Period start, ISO date YYYY-MM-DD. */
  from: string;
  /** Period end (inclusive), ISO date YYYY-MM-DD. */
  to: string;
  status: PeriodCloseStatus;
  /** UID of the user that initiated the close. */
  closedBy?: string;
  /** ISO datetime */
  closedAt?: string;
  /** UID of the user that reopened the period (when status === 'reopened'). */
  reopenedBy?: string;
  /** ISO datetime */
  reopenedAt?: string;
  /** Free-text justification — required when reopening. */
  reopenReason?: string;
  /** Snapshot of key financial totals at close time. */
  snapshot?: {
    revenue: number;
    expenses: number;
    profit: number;
    invoiceCount: number;
    expenseCount: number;
  };
  /** ISO datetime */
  createdAt: string;
  /** ISO datetime */
  updatedAt?: string;
}
