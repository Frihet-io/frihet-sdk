# Changelog

All notable changes to `@frihet/sdk` will be documented in this file.

## Unreleased

### Fixed

- Generate one cryptographically strong UUID v4 for every POST when the caller
  does not supply an `Idempotency-Key`, and preserve it across all retry
  attempts. Credit-note creation and CLI mutations therefore work safely
  without manual request options.
- Retry uncertain network/5xx outcomes only for GET and idempotency-protected
  POST requests. PATCH and DELETE no longer retry 5xx responses without a
  server-side idempotency contract; pre-handler 429 retries remain enabled.
- Fall back to `node:crypto` on Node 18 when global Web Crypto is unavailable,
  handle malformed `Retry-After` values with exponential backoff, and remove
  forwarded abort listeners after each attempt.

## 1.1.0 - 2026-06-15

### Added (D4-C — HR + webhook types)

- **HR types**: `LeaveType`, `LeaveStatus`, `LeaveRequest`, `LeaveEntitlement`,
  `CreateLeaveRequestParams`, `LeaveListParams`, `MoodValue`, `DeviceType`,
  `BreakType`, `BreakEntry`, `AttendanceEntry`, `PayrollProfile`,
  `PayrollExportFormat` (a3 / contasol / sage / holded / siltra).
- **Banking types**: `BankTransaction`, `BankException`, `BankExceptionStatus`,
  `BankRule`, `BankRuleCondition`, `BankRuleConditionField`,
  `BankRuleConditionOperator`, `BankRuleActionType`, `BankRuleActionConfig`,
  `CreateBankRuleParams`, `BankRuleSimulateResult`.
- **Period close types**: `PeriodClose`, `PeriodCloseStatus`,
  `PeriodGranularity`.
- **Webhook taxonomy**: `WebhookEventName` (full union of 62 events across
  16 categories — mirrors `apps/erp/lib/webhookEventTypes.ts`),
  `WebhookEventCategory`, `WebhookSignaturePayload`.
- **Helpers**: `createLeaveRequest`, `approveLeave`, `rejectLeave`,
  `bankRuleSimulate`, `periodCloseStatus`, `webhookSignatureVerify`
  (Node-only, sync, replay-protected, hex-sanitized, constant-time compare).

22 new unit tests; total suite now 88 tests passing.

## 1.0.4

- Bundle README inside the published tarball.
- Expand keywords; fix homepage URLs.

## 1.0.3

- Bundle README in SDK and CLI packages.

## 1.0.2

- CRM subcollections (contacts / activities / notes).

## 1.0.1

- Invoice and quote action endpoints (markPaid, send, pdf).

## 1.0.0

- Initial public release. Resources: invoices, expenses, clients, vendors,
  products, quotes, webhooks, intelligence.
