# Changelog

All notable changes to `@frihet/sdk` will be documented in this file.

## Unreleased

### Changed (Channels SDK-first retirement)

- The legacy top-level Channels read bridge (`list`, `retrieve`, `search`)
  keeps its exact existing GET paths, query behavior, and method signatures for
  a temporary compatibility window. These methods are now explicitly
  `@deprecated`, are not intended for new integrations, and do not claim an
  equivalent replacement route.
- The distributed `create`, `update`, `del`, and `sync` method names and
  signatures remain available for source compatibility but now fail locally
  with `CapabilityUnavailableError` before any HTTP request. CRUD mutations use
  `reason: 'absent'` because they are absent from the intended public contract;
  sync uses `reason: 'not_implemented'` because that public capability is
  deliberately not implemented.
- This release has **zero source/API-shape breaking changes**, but it does have
  an intentional behavior change: legacy Channels mutation methods no longer
  call the retiring top-level API surface. No package version is changed and no
  release is published by this pull request.

### Changed (Stay runtime truth)

- The `Stays` resource now follows the actual Frihet runtime instead of the
  generated scaffold. Only three stay routes exist server-side
  (`GET /stay/properties`, `GET /stay/reservations`,
  `GET /stay/reservations/:id`); `POST /stay/reservations` is registered but
  deliberately 501, and every other stay route is absent. All 36 public
  method names and signatures are preserved — **zero source/API-shape
  breaking changes**; previously nonfunctional calls now fail locally with a
  typed error instead of dispatching to 404/405/501 — but unavailable
  methods are now `@deprecated` and fail closed with the new
  `CapabilityUnavailableError` (a `FrihetError`, not an `APIError`) **before
  any HTTP request**, with `reason: 'absent' | 'not_implemented'`.
- Live list methods send only runtime-supported query params:
  `listProperties` allows `q`, `isActive`, `limit`, `offset`;
  `listReservations` allows `propertyId`, `status`, `checkInFrom`,
  `checkInTo`, `limit`, `offset`. New `checkInFrom`/`checkInTo` fields on
  `StayReservationListParams`; deprecated aliases `from`/`to` map to them
  (setting both alias and canonical param throws `ValidationError`). Any
  other defined param — the unsupported `q`/`channel` (reservations) and
  `type` (properties) filters, the inherited `cursor`/`fields`, or an
  arbitrary unknown key — fails deterministically with
  `CapabilityUnavailableError` naming the offending param instead of being
  silently sent or silently dropped. Undefined values are still skipped.
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
