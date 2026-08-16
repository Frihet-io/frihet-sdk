# Changelog

All notable changes to `@frihet/sdk` will be documented in this file.

## Unreleased

### Changed (Stay runtime truth)

- The `Stays` resource now follows the actual Frihet runtime instead of the
  generated scaffold. Only three stay routes exist server-side
  (`GET /stay/properties`, `GET /stay/reservations`,
  `GET /stay/reservations/:id`); `POST /stay/reservations` is registered but
  deliberately 501, and every other stay route is absent. All 36 public
  method names and signatures are preserved — **no breaking changes** — but
  unavailable methods are now `@deprecated` and fail closed with the new
  `CapabilityUnavailableError` (a `FrihetError`, not an `APIError`) **before
  any HTTP request**, with `reason: 'absent' | 'not_implemented'`.
- Live list methods send only runtime-supported query params:
  `listProperties` allows `q`, `isActive`, `limit`, `offset`;
  `listReservations` allows `propertyId`, `status`, `checkInFrom`,
  `checkInTo`, `limit`, `offset`. New `checkInFrom`/`checkInTo` fields on
  `StayReservationListParams`; deprecated aliases `from`/`to` map to them
  (setting both alias and canonical param throws `ValidationError`). The
  unsupported `q`/`channel` (reservations) and `type` (properties) filters
  are `@deprecated` and fail deterministically instead of being silently
  sent or ignored.
- New `src/resources/stay.manifest.ts` runtime-truth manifest is the single
  source of truth driving both the resource class and the test suite.

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
