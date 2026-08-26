# Release truth — SDK/CLI publish drift (2026-08-26)

Receipt for the drift verified from zero on 2026-08-26 and for the detector added
to keep it from recurring silently. Every number below was measured in-session, not
carried over from a prior report.

## 1. The drift

Both packages ship from `main` at `1.2.1`. The registry has never seen `1.2.1`.

| Package | `main` | npm `latest` | Published | Verdict |
|---|---|---|---|---|
| `@frihet/sdk` | 1.2.1 | 1.2.0 | 2026-06-20 | never published |
| `frihet` (CLI) | 1.2.1 | 1.2.0 | 2026-06-20 | never published |

Seven commits sit unpublished behind `1.2.0` (`42f06cf..origin/main`): #5, #4/#6,
#7, #8, #9, #10. Publishable source changed by **+798 / −92 lines across 7 files**
(`packages/*/src`, tests excluded).

## 2. Why npm's usual authority does not work here

The `frihet-mcp` drift detector compares npm's recorded `gitHead` against the repo.
That cannot be ported: **`gitHead` is absent from every published manifest of both
packages** (verified against the full manifest key set for `@frihet/sdk@1.2.0` and
`frihet@1.2.0`). npm only records `gitHead` when publishing from a git checkout with
certain client versions; these releases carry none.

The authority derived instead is stronger than `gitHead`, because it checks bytes
rather than a self-reported label: **this repo's build is byte-reproducible.**
Rebuilding `42f06cf` (the `1.2.0` release commit) reproduces the published tarball
exactly — all 6 `dist` files of `@frihet/sdk` and the 1 `dist` file of `frihet`, byte
for byte, including both sourcemaps (which carry relative `../src/...` paths, not
machine-absolute ones). `gitHead` asserts provenance; a byte match proves it.

## 3. What is actually missing from npm

### `@frihet/sdk` — runtime bundle 29,612 B → 50,314 B (+70%)

| Missing capability | Consequence on npm today |
|---|---|
| `CapabilityUnavailableError` (new public export) | Absent from the published bundle entirely (0 occurrences vs 45 in `main`). |
| `Intelligence.summary()` type alignment (#10) | Published `FinancialSummary` **does not match the runtime envelope**: `expenses: number` (runtime: `{ total }`), `invoiceStatus` (runtime: `invoicesByStatus`), `overdue.total` (runtime: `overdue.amount`), and `period` missing. TypeScript consumers read `undefined` at runtime on every renamed field. |
| Stay runtime-truth gating (#7) | `checkInFrom` / `checkInTo` absent (0 vs 6 occurrences). Unsupported params still dispatch to 404/405/501 instead of failing closed locally. |
| Channels mutation retirement (#8) | `create`/`update`/`del`/`sync` still hit the retiring top-level API. |
| Idempotency-safe POST retries (#5) | Published bundle carries 2 `idempotencyKey` sites vs 6; POST retries are not idempotency-safe. |

### `frihet` (CLI) — dist is byte-identical except the version string

`packages/cli/src` has **zero** changes since `1.2.0`; the only dist delta is
`CLI_VERSION "1.2.0" → "1.2.1"`. The CLI is nonetheless affected, because it does
**not** bundle the SDK — it imports it, and `pnpm publish` rewrites `workspace:*`
into an exact pin (published `frihet@1.2.0` depends on `@frihet/sdk@1.2.0`).
**Every CLI user today therefore runs the stale SDK runtime above.**

## 4. The detector

`scripts/check-publish-drift.mjs`, wired by `.github/workflows/publish-drift.yml`.

Per package (discovered from the filesystem, never a hardcoded list), it resolves the
`package.json` version against the registry and emits one verdict:

| Verdict | Meaning | Exit |
|---|---|---|
| `IN_SYNC` | Published bytes rebuild exactly from this source | 0 |
| `PENDING_PUBLISH` | Merged to `main`, never published — *the drift* | 2 |
| `DIST_MISMATCH` | Published version's bytes ≠ this source | 1 |
| fail-closed | No verdict could be established | 3 |

**Stated scope.** It compares `dist/**` only. `README.md`, `CHANGELOG.md` and
`LICENSE` ship in the tarball but are documentation, and tests never reach `dist` —
so a doc-only or test-only change cannot turn this gate red. A green means
"published bytes match this source", not "the tarball is identical".

**Where it blocks.** On a pull request it runs `--allow-pending`: only
`DIST_MISMATCH` blocks — "you changed published bytes without bumping the version",
which is always wrong and is precisely the condition that creates the next drift. A
version not yet on npm is the *expected* state of a release-prep PR and must not
block it. On `main`, on a weekday schedule, and on demand it runs strict, so an
unpublished release keeps the workflow red until it is published or reverted.

**Anti-defang.**
- Packages are discovered from `packages/*/package.json`; a new package cannot escape
  by not being added to a list, and coverage cannot be dropped without deleting code.
- No skip env var, and an **unrecognised flag fails closed** rather than being read as
  a weaker mode.
- The tarball is **sha512-verified against the registry's `dist.integrity`** before its
  bytes are trusted, so a poisoned cache cannot manufacture a green.
- Vacuous-green guards: missing `dist`, empty `dist`, an empty published `dist`, or
  zero files actually compared all exit 3 instead of passing.
- The reproducibility premise is **re-proven on every run**. `reproducibility-pin`
  rebuilds the commit in `scripts/publish-pins.json` and asserts `--expect-in-sync`
  before any drift verdict is trusted. A gate that assumed its own authority would be
  the phantom mechanism it exists to catch.

Verified locally across all six paths: `IN_SYNC`→0, `PENDING_PUBLISH`→2,
`--allow-pending`→0, `DIST_MISMATCH`→1 (fatal even under `--allow-pending`),
unknown flag→3, missing `dist`→3.

**Cross-platform reproducibility: verified, not assumed.** Proven on darwin/Node 22
locally and on `ubuntu-latest`/Node 20 in CI — the `reproducibility-pin` job rebuilt
`42f06cf` on the runner and reported `IN_SYNC` for both packages (6 SDK dist files
and 1 CLI dist file byte-identical to the published 1.2.0 tarballs), run
[32978152356](https://github.com/Frihet-io/frihet-sdk/actions/runs/32978152356). The
job re-runs on every invocation, so a future toolchain change that breaks
determinism fails the gate closed instead of silently degrading its authority.

## 5. Recommended release after #11

#11 changes `packages/sdk/src/client.ts`, so it lands inside this same unpublished
delta and should merge before the release.

**Recommendation: `1.3.0` for both packages — not `1.2.1`.** Owner's call, since
publishing is irreversible and semver is a public contract.

- `1.2.1` is wrong under any reading: a patch release must not add a new public
  export, and `CapabilityUnavailableError` is one.
- `2.0.0` is defensible by the letter of semver — the `FinancialSummary` retype
  breaks compilation for consumers touching `.expenses`, `.invoiceStatus` or
  `.overdue.total`. It is not recommended because every such "break" corrects a
  surface that was already non-functional at runtime (those fields returned
  `undefined`; the retired routes returned 404/405/501), and a major would strand
  `^1.2.0` consumers on the non-idempotent POST retry path — the one genuine safety
  fix in this delta.
- The retype must be **headlined as breaking for TypeScript consumers** in the
  CHANGELOG regardless of the number chosen.

Both packages have shipped lockstep since `1.0.0`; keeping that is worth more than
minimising the CLI's number, and the CLI must be republished anyway to re-pin the SDK.

## 6. Safe order: merge → publish → verify

1. Merge #11.
2. Release PR: bump both to `1.3.0`, headline the `FinancialSummary` break, move the
   SDK CHANGELOG `## Unreleased` section under `## 1.3.0`.
3. Merge. Require CI green on `main` **at the exact release SHA**.
4. `git checkout main && git pull && pnpm install --frozen-lockfile && pnpm build`.
5. Publish **`@frihet/sdk` first**. The CLI's `workspace:*` is rewritten to an exact
   pin at pack time, so publishing the CLI first yields a package pinned to an SDK
   version the registry does not have.
6. Publish `frihet` second.
7. Verify from a clean tree: `pnpm run check:publish-drift` must exit **0** with
   `IN_SYNC` for both. Confirm `npm view frihet@1.3.0 dependencies` pins
   `@frihet/sdk@1.3.0`.
8. Tag the release commit and append its pin to `scripts/publish-pins.json`
   (optional but recommended — it widens the reproducibility evidence base).

Nothing in this PR publishes, tags or releases.

## 7. Out-of-scope findings (not fixed here)

- **#11 escapes the em-dash** in `packages/cli/package.json`: the literal `—` becomes
  the six-character escape `\u2014` in the `description` field. Cosmetic, almost certainly an editor artifact, but it
  lands in the published manifest and reads as mojibake in some npm surfaces. Worth
  fixing inside #11.
- **Releases are not tagged.** The only tag in the repo is `v1.1.0`; `1.2.0` was never
  tagged. Tagging on publish would add a second, independent authority alongside the
  byte comparison.
- **There is no publish workflow.** Publishing is a manual `npm publish` from a laptop,
  which is the root cause of this drift being invisible for ~9 weeks. Automating it is
  a new capability and deliberately out of scope for this PR.
