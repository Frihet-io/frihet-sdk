# Changelog

All notable changes to `frihet` (CLI) will be documented in this file.

## 1.2.1 - 2026-08-17

### Changed

- Bump the packaged `@frihet/sdk` dependency to 1.2.1. The SDK release preserves
  public method names and signatures while correcting Stay runtime truth and
  retiring legacy Channels mutations locally. There are no CLI command-shape
  changes in this patch.

## 1.1.0 - 2026-06-15

### Changed

- Bump dependency on `@frihet/sdk` to 1.1.0 (HR types, banking types, period-close types,
  full webhook taxonomy, and 22 new unit tests).

## 1.0.4

- Bundle README inside the published tarball.
- Expand keywords; fix homepage URLs.

## 1.0.3

- Bundle README in CLI package.

## 1.0.2

- CRM subcollections support via updated SDK dependency.

## 1.0.1

- Invoice and quote action commands (markPaid, send, pdf) via updated SDK.

## 1.0.0

- Initial public release. Commands: login, status, invoices, expenses, clients,
  vendors, products, quotes, webhooks.
