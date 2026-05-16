/**
 * Webhook event taxonomy (D1-T2).
 *
 * Source of truth: `apps/erp/lib/webhookEventTypes.ts` in the ERP repo
 * (62 events across 16 categories, adapted from Lago + Frihet-native).
 *
 * The SDK exposes the **string union** of valid event names so consumers
 * can type-check webhook subscriptions and dispatchers without pulling in
 * the full registry (kept server-side to avoid bundle bloat).
 *
 * The pre-existing `WebhookEvent` union in `../types.ts` is kept as a
 * narrow subset for backwards compatibility; `WebhookEventName` is the
 * canonical full union exported from this module.
 */

export type WebhookEventCategory =
  | 'invoice'
  | 'payment'
  | 'payment_receipt'
  | 'payment_request'
  | 'credit_note'
  | 'client'
  | 'recurring_invoice'
  | 'dunning'
  | 'wallet'
  | 'wallet_transaction'
  | 'quote'
  | 'expense'
  | 'product'
  | 'alert'
  | 'bank_transaction'
  | 'integration';

/**
 * Canonical webhook event name union. Mirrors the `event` field of
 * `WEBHOOK_EVENTS` in apps/erp/lib/webhookEventTypes.ts.
 *
 * Events flagged `implemented: false` server-side are still type-valid
 * here so external integrations can subscribe ahead of GA.
 */
export type WebhookEventName =
  // invoice
  | 'invoice.created'
  | 'invoice.updated'
  | 'invoice.generated'
  | 'invoice.paid'
  | 'invoice.payment_status_updated'
  | 'invoice.overdue'
  | 'invoice.payment_failure'
  | 'invoice.payment_dispute_lost'
  | 'invoice.one_off_created'
  | 'invoice.paid_credit_added'
  | 'invoice.voided'
  | 'invoice.resynced'
  // payment
  | 'payment.succeeded'
  | 'payment.requires_action'
  // payment_receipt
  | 'payment_receipt.created'
  | 'payment_receipt.generated'
  // payment_request
  | 'payment_request.created'
  | 'payment_request.payment_status_updated'
  | 'payment_request.payment_failure'
  // credit_note
  | 'credit_note.created'
  | 'credit_note.generated'
  | 'credit_note.refund_failure'
  // client
  | 'client.created'
  | 'client.updated'
  | 'client.vies_check'
  | 'client.checkout_url_generated'
  | 'client.payment_provider_created'
  | 'client.payment_provider_error'
  | 'client.accounting_provider_created'
  | 'client.accounting_provider_error'
  | 'client.crm_provider_created'
  | 'client.crm_provider_error'
  | 'client.tax_provider_error'
  // recurring_invoice
  | 'recurring_invoice.started'
  | 'recurring_invoice.terminated'
  | 'recurring_invoice.termination_alert'
  | 'recurring_invoice.trial_ended'
  | 'recurring_invoice.updated'
  | 'recurring_invoice.usage_threshold_reached'
  // dunning
  | 'dunning.finished'
  // wallet
  | 'wallet.created'
  | 'wallet.updated'
  | 'wallet.terminated'
  | 'wallet.depleted_ongoing_balance'
  // wallet_transaction
  | 'wallet_transaction.created'
  | 'wallet_transaction.updated'
  | 'wallet_transaction.payment_failure'
  // quote
  | 'quote.created'
  | 'quote.updated'
  | 'quote.accepted'
  | 'quote.rejected'
  | 'quote.expired'
  // expense
  | 'expense.created'
  | 'expense.updated'
  | 'expense.approved'
  // product
  | 'product.created'
  | 'product.updated'
  // alert
  | 'alert.triggered'
  // bank_transaction
  | 'bank_transaction.reconciled'
  // integration
  | 'integration.provider_error';

/**
 * Shape of the payload received when verifying a Frihet webhook signature.
 *
 * Frihet signs webhooks with HMAC-SHA256 over the raw request body. The
 * timestamp is sent in the same header (`X-Frihet-Signature`) and is used
 * to reject replays older than the configured tolerance (default 300s).
 *
 *   X-Frihet-Signature: timestamp=1715800000, signature=<hex64>
 */
export interface WebhookSignaturePayload {
  /** Raw request body as sent by Frihet (must NOT be JSON-reparsed). */
  payload: string;
  /** Full value of the `X-Frihet-Signature` request header. */
  signature: string;
  /** Webhook secret as displayed once in the Frihet UI. */
  secret: string;
  /** Maximum age in seconds for the timestamp inside the header (default 300). */
  maxAgeSeconds?: number;
}
