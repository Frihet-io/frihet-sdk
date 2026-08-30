# Changelog

All notable changes to `frihet` (CLI) will be documented in this file.

## 1.3.0 - 2026-08-30

**This is the first release of `frihet` (CLI) since 1.2.0 (2026-06-20).**
It consolidates the agent-native onboarding work that landed in source
over the intervening period but never reached the registry. The CLI
depends on `@frihet/sdk@1.3.0`, which must be published first (the
`workspace:*` reference is rewritten to an exact pin at pack time).
There are no CLI command-shape changes.

### Added (agent-native onboarding)

- **`getApiKey()` now emits a machine-readable JSON line on credential
  failure** in addition to the human-readable stderr message. The JSON
  carries:
  - `error.code: 'FRIHET_API_KEY_MISSING'`
  - `error.message`
  - `error.obtainAt: 'https://app.frihet.io/settings/api'` (the page
    that actually issues keys — `/settings/security` is a different
    screen and does not create one)
  - `error.recovery`: an array of `{ action, env | command,
    interactive }` entries, ordered non-interactive first
    (`export FRIHET_API_KEY=fri_…`) and then interactive
    (`frihet login`)
  - `error.exitCode: 1` (unchanged — existing scripts branch on the
    exit code; agents should branch on `error.code`)

  The motivation: `frihet login` prompts on a TTY, so telling an
  unattended caller to "run `frihet login`" is a dead end. The new
  line lets an agent recover without a TTY and without parsing free-form
  English.

- **AGENTS.md** at the repository root documents the CLI's contract
  for agents: env-only quickstart, the draft-first workflow, the
  human-authority table, and the typed-error / retry contract.
  **AGENTS.md lives at the repository root and is not packaged into
  the npm tarball.** The `packages/cli/README.md` (shipped in the
  npm package) is the authoritative consumer-facing guide for `frihet`
  consumers and now ships a "For AI agents" non-interactive
  quickstart; the `AGENTS.md` is the contributor-facing contract.

- **README.md** gains a "For AI agents" section cross-linked to the
  MCP server's generated onboarding descriptor. The `README.md` is
  the authoritative consumer-facing guide for the `frihet` npm
  package; the root `AGENTS.md` is the contributor-facing contract
  and is **not** included in the npm tarball.
- **`frihet login` URL hint** corrected. The command prompted
  `Get your API key at https://app.frihet.io/settings/security`,
  which is a real screen but not the one that issues API keys. The
  hint is now `https://app.frihet.io/settings/api`. The CLI README
  ships the same correction.

- **CLI package now ships vitest** with
  `packages/cli/src/__tests__/agent-contract.test.ts` (4 assertions,
  two of them anti-drift rather than anti-regression). Wired into CI.

### Fixed

- Bump the packaged `@frihet/sdk` dependency to `1.3.0`. The SDK release
  preserves public method names and signatures while correcting
  `FinancialSummary` to match the runtime envelope, retiring legacy
  Channels mutations locally with `CapabilityUnavailableError`, gating
  Stays on runtime truth, and adding the agent-native key URL hint.
  See the SDK CHANGELOG for the full set.

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
