# Release 1.3.0 — Frihet SDK + CLI

This document is the release record for the first `1.x` since `1.2.0`
(2026-06-20). The version is `1.3.0` (not `1.2.1`) because the SDK adds
a new public export (`CapabilityUnavailableError`); a patch release would
not be semver-honest.

## 1. What ships

| Package | Previous | Target | Breaking TS? | Notes |
|---|---|---|---|---|
| `@frihet/sdk` | 1.2.0 | 1.3.0 | yes (`FinancialSummary`) | Adds `CapabilityUnavailableError`; Stay / Channels runtime-truth; idempotency-safe POST retries; agent-native key URL hint. |
| `frihet` (CLI) | 1.2.0 | 1.3.0 | no | Adds the `FRIHET_API_KEY_MISSING` machine-readable error contract; ships AGENTS.md; bumps packaged SDK to 1.3.0. |

## 2. Breaking change, headlined

**For TypeScript consumers only.** The `FinancialSummary` interface was
corrected to match the runtime envelope emitted by
`GET /v1/summary` (Frihet-ERP origin/main `d5f3f3cdf`,
`functions/src/publicApi.ts` lines 2593–2607). The runtime JSON never
changed; only the TypeScript surface did. No backend capability was
added or removed by this change. Pin test:
`packages/sdk/src/__tests__/intelligence-summary.test.ts`.

| Field | Was | Is |
|---|---|---|
| `expenses` | `number` | `{ total: number }` |
| `invoiceStatus` | `Record<string, number>` | `invoicesByStatus: Record<string, number>` (renamed) |
| `overdue.total` | `number` | `overdue.amount: number` (renamed) |
| `counts` | `Record<string, number>` | typed `{ invoices, quotes, expenses, clients, products }` |
| `period` | absent | `{ from: string \| null; to: string \| null }` (new) |

## 3. Forced publish order

**SDK first, then CLI.** The CLI's `package.json` depends on
`@frihet/sdk` via `workspace:*`. `pnpm publish` rewrites that
reference to an exact version at pack time. If the CLI is published
first, its tarball pins to `@frihet/sdk@1.3.0`, which the registry does
not yet have — CLI installers break. The SDK must be visible on the
registry before the CLI is published.

```
1. pnpm publish --filter @frihet/sdk   →  @frihet/sdk@1.3.0  on npm
2. pnpm publish --filter frihet         →  frihet@1.3.0       on npm
```

## 4. Detector authority (PR #12)

The publish-drift detector introduced in PR #12 is the audit gate for
this release:

- **Authority**: byte-reproducible `dist/**` compared against the
  published tarball, because npm exposes no `gitHead` for these
  packages.
- **Reproducibility pin** (`scripts/publish-pins.json`) holds `42f06cf`
  (the `1.2.0` release commit) and adds a new entry for the `1.3.0`
  release commit. The `reproducibility-pin` workflow job re-runs
  against the pinned commit on every detector invocation; if the build
  ever stops being byte-deterministic, the gate fails closed before
  emitting a verdict it can no longer justify.
- **Verdicts**: `IN_SYNC` (exit 0) · `DIST_MISMATCH` (exit 1, blocks
  everywhere — even under `--allow-pending`) · `PENDING_PUBLISH`
  (exit 2, blocks on main and schedule, non-blocking on PR) ·
  fail-closed (exit 3) for any unprovable condition.
- **Anti-defang**: filesystem package discovery (no escape by
  omission from a list), no skip env, unknown flag → fail-closed,
  tarball integrity verified via sha512 (sha1 fallback) before bytes
  are trusted, empty / vacuous comparisons fail-closed.

For the `1.3.0` release:

- **Pre-publish expected state**: `PENDING_PUBLISH` (exit 2 in strict
  mode on main) for both packages, because npm still serves `1.2.0`.
- **Immediate post-publish expected state (SDK)**: `PENDING_PUBLISH`
  for `frihet@1.3.0` (CLI not yet published) and `IN_SYNC` for
  `@frihet/sdk@1.3.0`.
- **After both packages publish**: `IN_SYNC` for both, exit 0.
- **Failure mode that should never appear**: `DIST_MISMATCH`. If it
  does, the release was published with a different `dist/**` than this
  source produces, and the version was wrong.

## 5. Operational notes

- No `Math.random` in anything retry- or idempotency-related
  (`generateIdempotencyKey` falls back to `node:crypto`).
- Per-request `Idempotency-Key` shared across all retry attempts for
  the same logical request — generating one per attempt would defeat
  the mechanism.
- `Retry-After` above 60s is surfaced on `RateLimitError.err.retryAfter`
  rather than slept through.

## 6. Out of scope (explicit)

- No new backend capabilities. Every change in this release is a
  correction or a safety fix; the Frihet REST surface is unchanged.
- No new SDK command-shape changes.
- No CLI command additions. The `frihet` surface is unchanged.
- No npm publish, no dist-tag mutation, no tag, no GitHub Release
  from this branch. The release PR is for review and merge only; the
  actual `pnpm publish` is the owner-authorized step that follows.
