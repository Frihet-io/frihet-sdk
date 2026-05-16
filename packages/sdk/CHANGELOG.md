# Changelog

All notable changes to `@frihet/sdk` will be documented in this file.

## Unreleased

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
