# Release 1.3.0 — Frihet SDK + CLI

This document is the release record for the first `1.x` since `1.2.0`
(2026-06-20). The version is `1.3.0` (not `1.2.1`) because the SDK adds
a new public export (`CapabilityUnavailableError`); a patch release would
not be semver-honest.

## 1. What ships

| Package | Previous | Target | Breaking TS? | Notes |
|---|---|---|---|---|
| `@frihet/sdk` | 1.2.0 | 1.3.0 | yes (`FinancialSummary`) | Adds `CapabilityUnavailableError`; Stay / Channels runtime-truth; idempotency-safe POST retries; agent-native key URL hint. |
| `frihet` (CLI) | 1.2.0 | 1.3.0 | no | Adds the `FRIHET_API_KEY_MISSING` machine-readable error contract; corrects the `frihet login` URL hint; ships the "For AI agents (non-interactive)" section in the published `packages/cli/README.md`; bumps packaged SDK to 1.3.0. |

> **Repository release vs npm package surface** — terminology used
> in this document:
>
> - **REPOSITORY RELEASE** — what is included in the GitHub release
>   on this branch: the full source tree, including root `AGENTS.md`
>   and root `README.md`.
> - **NPM `@frihet/sdk` PACKAGE** — the published tarball: source
>   `dist/**`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`.
>   Does **not** include the root `AGENTS.md`.
> - **NPM `frihet` (CLI) PACKAGE** — the published tarball: `dist/`,
>   `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`. Does
>   **not** include the root `AGENTS.md`.
> - **NPM consumer guidance** — the per-package `README.md` is the
>   authoritative consumer-facing guide for each npm surface. The
>   root `AGENTS.md` is the contributor-facing contract and is
>   **not** shipped in any npm tarball. Do not add `AGENTS.md` to
>   the npm package `files` field.

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

## 7. Package surface vs repository guidance

The `AGENTS.md` shipped as part of this release lives **at the repository
root** (`/AGENTS.md` on GitHub). It is **not** packaged into either
npm tarball.

| Surface | Where it lives | What consumers see |
|---|---|---|
| **NPM package — `@frihet/sdk`** | `packages/sdk/README.md` (published), `dist/index.{cjs,js}` (published), `dist/index.d.{cts,ts}` (published), `dist/*.map` (published) | The library's installed `node_modules/@frihet/sdk/README.md` and `dist/`. |
| **NPM package — `frihet` (CLI)** | `packages/cli/README.md` (published), `dist/index.js` (published) | The installed `node_modules/frihet/README.md` and `dist/`. |
| **Repository guidance** | `AGENTS.md` (root, not packaged), `README.md` (root, not packaged) | Visible only to consumers of the GitHub repository, not to consumers of the npm packages. |

The per-package `README.md` is the authoritative consumer-facing guide
for each npm surface. The `AGENTS.md` at the repo root is the
contributor-facing contract (build, style, gotchas). Consumers of the
npm packages do not need the repo's `AGENTS.md` and do not receive it.

## 8. Pin provenance — current state

`scripts/publish-pins.json` has a new entry for `1.3.0` referencing
commit **`0192c0ec923eeed6ea1b71d2e512e44779aaddee`** (the exact
release-candidate SHA on `release/sdk-1.3.0` at the moment this
document was written). This is **not** a fabricated future SHA — it
is the SHA the reviewer can check out, build, and confirm produces
the inspected `1.3.0` candidate dist, including the `frihet login`
URL-hint correction from the remediation commit.

The note is `PENDING verification`. The 1.3.0 pin will not be promoted
to `verified` form until registry byte-equality has actually been
observed (i.e. `pnpm publish` has run, the tarball is on the registry,
and a rebuild from the canonical main SHA produces the same bytes).

Why the pin is **not** the version-bump commit `79d2101`: the
remediation commit `0192c0e` materially changed
`packages/cli/src/commands/login.ts` and therefore the CLI
`dist/index.js` bytes. A build from `79d2101` no longer produces
the final `1.3.0` dist, so the pin had to move to the later
remediated commit. This is the same reason a post-merge repin (if
byte-equivalent) is allowed: the pin always references the commit
that produces the actual bytes, not a symbolic landmark.

## 9. Pre-publish truth — what must be true before any `pnpm publish`

Before this PR is merged and before any package is published, the
following MUST all hold:

- All CI green on the release PR (sdk 18 / sdk 20 / sdk 22 /
  `Prove byte-reproducibility on this runner` / `Detect publish drift`).
- The existing `1.2.0` reproducibility authority is still green —
  i.e. the `Prove byte-reproducibility on this runner` job rebuilt
  `42f06cf5462a932a1473592d6b8cde82f59d64e1` and reported `IN_SYNC`
  for both `@frihet/sdk@1.2.0` and `frihet@1.2.0`. This is the proof
  the build is still byte-deterministic; without it, the detector
  has no authority to emit any verdict.
- The exact `1.3.0` release-candidate packs have been inspected:
  the right files are inside, the right dependencies are pinned
  (`@frihet/sdk@1.3.0` exact in the CLI), the right URLs are in
  the CLI README and the CLI dist, no secrets, no local paths, no
  internal-only files.
- The candidate secret scan is clean (no `.env`, no `.npmrc`, no
  PEM private keys, no `npm_*` / `npx_*` / `sk-*` / `AKIA*` patterns,
  no absolute paths in tarball contents).

**What is NOT a pre-publish requirement:** `IN_SYNC` for `1.3.0` is
impossible pre-publish. With `npm latest = 1.2.0` and source at
`1.3.0`, the publish-drift detector in strict mode MUST report
`PENDING_PUBLISH` for both packages. That is the expected pre-release
verdict, not a failure. `IN_SYNC` for `1.3.0` becomes possible ONLY
after registry publication. Requiring `IN_SYNC` before publish
would be a circular gate (the registry can never be `IN_SYNC` for a
version that has never been published to it).

## 10. Post-merge / publish order — A through L

This is the exact sequence the owner-authorized publish step MUST
follow. Any deviation is out of scope for this release.

**A. Merge #13 only after independent exact-SHA approval.**
The merge commit is the canonical release source. Independent
review must return

```
APPROVE_RELEASE_SDK_13_EXACT(REVIEW_HEAD)
```

where `REVIEW_HEAD` is the **full current PR HEAD** — the exact
SHA at the tip of `release/sdk-1.3.0` at the moment the reviewer
runs the gate. The approval token must bind the full PR head; it
must not bind a short SHA, a partial SHA, or any commit other than
the PR head.

The `CANDIDATE_DIST_SHA = 0192c0ec923eeed6ea1b71d2e512e44779aaddee`
is a **separate invariant**: it is the commit whose build produces
the inspected `1.3.0` candidate dist. Later commits on the release
branch (e.g. documentation-only edits like `4f49a5d` or this
release-authority correction) do not change the dist bytes, so
`CANDIDATE_DIST_SHA` remains stable across them. The reviewer must
verify that a build of `REVIEW_HEAD` produces a dist that is
**byte-identical** to the dist of `CANDIDATE_DIST_SHA`. If the
byte-equality fails: STOP, re-investigate, do not approve.

The two SHAs are independent invariants:

| Invariant | Binds | Stable across |
|---|---|---|
| `REVIEW_HEAD` | The PR head the reviewer is approving | one commit per `gh pr edit` / push |
| `CANDIDATE_DIST_SHA` | The commit whose dist bytes were inspected | until the next source change that mutates dist |

Approval requires both: `REVIEW_HEAD` is the current PR head AND
`build(REVIEW_HEAD).dist/**` is byte-identical to
`build(CANDIDATE_DIST_SHA).dist/**`.

**B. Capture `RELEASE_MAIN_SHA`** — the exact SHA on `main` after
the squash-merge of #13 completes (`git rev-parse origin/main`).

**C. Rebuild both packages from `RELEASE_MAIN_SHA`** — using the
same toolchain and frozen lockfile that produced the candidate in
this PR. No toolchain drift between candidate and canonical.

**D. Byte-compare** `RELEASE_MAIN_SHA` dist/** against the reviewed
candidate `0192c0e` dist/**. This is the canonical-release-provenance
gate. **If the byte-compare FAILS: STOP. Do not publish. Re-open or
re-verify the release PR.** If it succeeds, set
`CANONICAL_RELEASE_BYTES_PROVEN = YES` and continue.

**E. Publish exactly from canonical proven release source/artifacts.**

1. `pnpm publish --filter @frihet/sdk` from `RELEASE_MAIN_SHA` →
   `@frihet/sdk@1.3.0` on npm.

**F. SDK registry readback** (mandatory before continuing to G):
- `npm view @frihet/sdk@1.3.0 version` returns `"1.3.0"`.
- `npm view @frihet/sdk@1.3.0 dist.integrity` is present.
- The downloaded tarball's `dist/**` bytes equal
  `RELEASE_MAIN_SHA` dist bytes. Require `SDK_IN_SYNC = YES`.

If the readback fails: STOP. Do not publish the CLI. Investigate.

**G. Only then publish the CLI.**

2. `pnpm publish --filter frihet` from the same `RELEASE_MAIN_SHA` →
   `frihet@1.3.0` on npm.

**H. CLI registry readback** (mandatory):
- `npm view frihet@1.3.0 version` returns `"1.3.0"`.
- `npm view frihet@1.3.0 dependencies['@frihet/sdk']` returns
  `"1.3.0"` (exact pin, not a range).
- The downloaded tarball's `dist/**` bytes equal `RELEASE_MAIN_SHA`
  CLI dist bytes. Require `CLI_IN_SYNC = YES`.

If the readback fails: STOP. Investigate. (A CLI in the registry
with the wrong SDK pin breaks every CLI installer — that is the
exact failure the forced SDK-first / CLI-second order exists to
prevent.)

**I. Run publish-drift in strict mode** (no `--allow-pending`)
against `RELEASE_MAIN_SHA`. Required verdicts:

- `@frihet/sdk` → `IN_SYNC`
- `frihet` → `IN_SYNC`
- exit code `0`

If any package is not `IN_SYNC`: STOP. The post-publish provenance
is broken.

**J. Finalize the 1.3.0 reproducibility pin.** Open a post-release
provenance PR (or a direct commit on main, owner-authorized) that:
- Repoints the `1.3.0` pin in `scripts/publish-pins.json` to
  `RELEASE_MAIN_SHA`.
- Updates the note from `PENDING verification` to
  `verified <date>: rebuild matches both published tarballs byte-for-byte`,
  matching the `1.2.0` pin's wording.
- This commit is metadata-only (a single JSON line plus a note);
  it does not change any source or dist, so the dist bytes remain
  identical to `RELEASE_MAIN_SHA`.

If this metadata commit is a direct commit on main rather than a PR,
its own SHA is **not** the canonical release source — the canonical
release source is the dist produced at `RELEASE_MAIN_SHA`, which is
what consumers received from npm.

**K. Tag.** Create the canonical release tag pointing at
`RELEASE_MAIN_SHA` (NOT at the metadata-only pin-finalization
commit from J). The tag name follows the repository's canonical
convention (e.g. `v1.3.0` or the repository's existing release-tag
naming). Verify with `git show-ref --tags v1.3.0` that the tag
points at `RELEASE_MAIN_SHA` before continuing.

**L. GitHub Release** from that exact tag, with the
release notes that match the 1.3.0 CHANGELOG entries.
