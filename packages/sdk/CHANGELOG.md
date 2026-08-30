# Changelog

All notable changes to `@frihet/sdk` will be documented in this file.

## 1.3.0 - 2026-08-30

**This is the first release of `@frihet/sdk` since 1.2.0 (2026-06-20).** It
consolidates the runtime-truth corrections and the agent-native onboarding
work that landed in source over the intervening period but never reached
the registry. The version is `1.3.0` (not `1.2.1`) because the SDK adds
a new public export (`CapabilityUnavailableError`); a patch release would
not be semver-honest. The TypeScript compile-time break in
`FinancialSummary` is the only consumer-facing API-shape change and is
explicitly headlined below.

### BREAKING FOR TYPESCRIPT CONSUMERS

**`FinancialSummary` corrected to match runtime truth.** The 1.2.0
interface never matched the `GET /v1/summary` response envelope emitted
by the Frihet backend (Frihet-ERP origin/main `d5f3f3cdf`,
`functions/src/publicApi.ts` lines 2593–2607). Runtime callers read
`undefined` on every renamed field; TypeScript callers were silently
broken since the SDK was first released. 1.3.0 brings the type in line
with what the server actually returns:

- `expenses: number` → `expenses: { total: number }`
- `invoiceStatus: Record<string, number>` → `invoicesByStatus: Record<string, number>` (renamed; stale alias removed)
- `overdue: { count, total }` → `overdue: { count, amount }` (renamed)
- `counts: Record<string, number>` → typed `{ invoices, quotes, expenses, clients, products }` (narrower; open-shape consumers must update)
- new field: `period: { from: string | null; to: string | null }` (mirrors the `from` / `to` query params passed to `Intelligence.summary({ from, to })`; each is `null` when the caller did not supply a bound)

The underlying JSON envelope never changed — only the TypeScript surface
did. **No backend capability was added or removed by this change.** Pin
test: `packages/sdk/src/__tests__/intelligence-summary.test.ts` asserts
the route, verb, query params, canonical field names and period
nullability so this drift cannot recur undetected.

### Added

- **`CapabilityUnavailableError`** (extends `FrihetError`, exported from
  the package root) is the typed failure raised when the SDK is asked to
  use a capability the Frihet backend does not provide. It is a local,
  deterministic failure raised **before any HTTP request is sent**, so
  it extends `FrihetError` (not `APIError`). Carries `capability: string`
  and `reason: 'absent' | 'not_implemented'`. This is **not a new
  backend capability** — it is the local guard that prevents the SDK
  from dispatching to routes the backend does not serve.

- **AGENTS.md** at the repository root documents the SDK's contract for
  agents (both using and changing the repo) and exposes the env-only
  quickstart (`FRIHET_API_KEY` + `npx -y frihet status --json`) that
  does not require a config file or a TTY prompt.

### Changed (Stay runtime truth)

- The `Stays` resource now follows the actual Frihet runtime instead of
  the generated scaffold. Only three stay routes exist server-side
  (`GET /stay/properties`, `GET /stay/reservations`,
  `GET /stay/reservations/:id`); `POST /stay/reservations` is registered
  but deliberately 501, and every other stay route is absent.
- All 36 public method names and signatures are preserved — **no source
  breaking changes**; previously nonfunctional calls now fail locally
  with a typed `CapabilityUnavailableError` instead of dispatching to
  404/405/501. Unavailable methods are `@deprecated` and fail closed
  with `reason: 'absent' | 'not_implemented'`.
- Live list methods send only runtime-supported query params:
  `listProperties` allows `q`, `isActive`, `limit`, `offset`;
  `listReservations` allows `propertyId`, `status`, `checkInFrom`,
  `checkInTo`, `limit`, `offset`. New `checkInFrom` / `checkInTo`
  fields on `StayReservationListParams`; deprecated aliases `from` /
  `to` map to them. Setting both alias and canonical param throws
  `ValidationError`. Any other defined param — the unsupported
  `q` / `channel` (reservations) and `type` (properties) filters, the
  inherited `cursor` / `fields`, or an arbitrary unknown key — fails
  deterministically with `CapabilityUnavailableError` naming the
  offending param instead of being silently sent or silently dropped.
- New `src/resources/stay.manifest.ts` runtime-truth manifest is the
  single source of truth driving both the resource class and the test
  suite.

### Changed (Channels SDK-first retirement)

- The legacy top-level Channels read bridge (`list`, `retrieve`,
  `search`) keeps its exact existing GET paths, query behavior and
  method signatures for a temporary compatibility window. These methods
  are now explicitly `@deprecated`; they are not intended for new
  integrations and no replacement route is currently promised.
- The distributed `create`, `update`, `del` and `sync` method names and
  signatures remain available for source compatibility but now fail
  locally with `CapabilityUnavailableError` before any HTTP request.
  CRUD mutations use `reason: 'absent'` (absent from the intended public
  contract); sync uses `reason: 'not_implemented'` (deliberately not
  implemented). This is **not a new backend capability** — it is the
  local guard that prevents the SDK from continuing to call the
  retiring top-level API surface.

### Fixed (idempotency / retry safety)

- Generate one cryptographically strong UUID v4 for every POST when the
  caller does not supply an `Idempotency-Key`, and preserve it across
  all retry attempts. Credit-note creation and CLI mutations therefore
  work safely without manual request options.
- Retry uncertain network/5xx outcomes only for GET and
  idempotency-protected POST requests. PATCH and DELETE no longer retry
  5xx responses without a server-side idempotency contract; pre-handler
  429 retries remain enabled.
- `Retry-After` values above 60 seconds are surfaced to the caller
  rather than scheduled as an hours-long timer (carried as
  `err.retryAfter` on `RateLimitError`). Surface, do not sleep.
- Fall back to `node:crypto` on Node 18 when global Web Crypto is
  unavailable, handle malformed `Retry-After` values with exponential
  backoff, and remove forwarded abort listeners after each attempt.

### Fixed (default key URL)

- The `HttpClient` constructor pointed at
  `https://app.frihet.io/settings/security` for its key-creation hint
  text. That is a real screen but not the one that issues API keys
  (verified against the ERP: `settingsSectionToPath` renders
  `/settings/<id>`, and `api` resolves to `ApiKeysSettings`). The hint
  is now `https://app.frihet.io/settings/api`. **No HTTP behavior
  changed** — this is a developer-experience correction only.

## 1.2.1 - 2026-08-17

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
  call the retiring top-level API surface.

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
