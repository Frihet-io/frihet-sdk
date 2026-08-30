# Releasing `@frihet/sdk` and `frihet`

Both packages release in lockstep at the same version. Publishing is done by
`.github/workflows/publish.yml` using npm **trusted publishing** (OIDC): there is
no npm token anywhere in this repository, in its secrets, or on a runner.

---

## 1. Authority model

A release is authorised by an **annotated git tag on a commit that is already an
ancestor of `main`**, and by nothing else. From that tag the chain is: the
`verify` job proves the tag is annotated, that its commit is on `main`, that both
`package.json` versions equal the tag minus the `v`, and that neither version is
already on the registry — then builds, tests and `pnpm pack`s the exact bytes and
records their sha512. A human then approves the `npm-publish` environment, which
is the deliberate replacement for the passkey prompt of a manual publish. Only
after that approval does any job hold a credential, and that credential is a
short-lived GitHub OIDC token that npm accepts solely for this repository, this
workflow **filename**, and this environment. Each publish is followed by
`scripts/publish-readback.mjs`, which re-reads the registry over the network and
asserts it now serves byte-for-byte the tarball that was uploaded; the release
closes with a strict `check-publish-drift.mjs --expect-in-sync` (published bytes
rebuild exactly from this source) and a clean install of both packages from the
public registry. Every link is a job or step that fails the run — none is a claim
made only in this document.

---

## 2. Release steps (maintainer)

1. **One PR bumps everything.** In a single PR: bump `version` in
   `packages/sdk/package.json` and `packages/cli/package.json` to the same
   `X.Y.Z`, update both `CHANGELOG.md` files, and add the *pending* entry to
   `scripts/publish-pins.json`. `Publish Drift` on a PR runs with
   `--allow-pending`, so an unpublished bump is the expected state here; what it
   still blocks is changing published bytes without bumping the version.
2. **Merge to `main`.** Let CI go green on `main`.
3. **Tag the merge commit, annotated.** Lightweight tags are rejected by the
   *Assert the tag is annotated and resolve its commit* step:
   ```sh
   git checkout main && git pull
   git tag -a vX.Y.Z -m "release: X.Y.Z"
   git push origin vX.Y.Z
   ```
4. **Approve the deployment.** The tag push starts `Publish`. `verify` runs
   unattended; `publish-sdk` then waits on the `npm-publish` environment. Open the
   run, read the `verify` summary, and approve. Approving is the release decision —
   nothing has been published before this point.
5. **Watch it finish.** `publish-sdk` → `publish-cli` → `post-publish`. If
   `post-publish` is red the packages are *published but unproven*: read the
   failure before doing anything else, and do not tag another version to "fix" it
   until you know which assertion failed.
6. **Finalise the pin.** After a green run, commit the reproducibility pin for the
   released version in `scripts/publish-pins.json` (commit SHA → published
   version). The workflow does not do this for you — see §6.

---

## 3. Owner steps (manual, one-time, outside this repo)

**None of this is in the repository, and no CI job can do it.** Until steps 3.1
and 3.3 exist, `Publish` fails closed at npm authentication and nothing is
published. Do them in this order.

### 3.1 — GitHub environment (do this first; it is the human gate)

1. GitHub → `Frihet-io/frihet-sdk` → **Settings** → **Environments** → **New environment**
2. Name it exactly `npm-publish` → **Configure environment**
3. Tick **Required reviewers** → add the repository owner → **Save protection rules**
4. Under **Deployment branches and tags**, choose **Selected branches and tags** →
   **Add deployment branch or tag rule** → type **Tag** → pattern `v*` → **Add rule**
5. Do **not** add any environment secret. This environment carries no credential;
   its only job is to require a human and to restrict deployments to tags.

### 3.2 — npm trusted publisher for `@frihet/sdk`

1. npmjs.com → sign in as `frihet` → **Packages** → `@frihet/sdk` → **Settings**
2. **Trusted Publisher** → **GitHub Actions**
3. Organization or user: `Frihet-io`
4. Repository: `frihet-sdk`
5. Workflow filename: `publish.yml` — **filename only, case-sensitive.** Not a
   path, not `.github/workflows/publish.yml`.
6. Environment name: `npm-publish` — must match §3.1 exactly.
7. Allowed actions: **`npm publish`** (staged publishing is not used by this workflow).
8. Save.

### 3.3 — npm trusted publisher for `frihet`

Repeat §3.2 verbatim for the `frihet` package. Same org, same repository, same
workflow filename, same environment. Both packages need their own trusted
publisher; configuring only one leaves `publish-cli` failing at authentication
*after* the SDK has already been published.

### 3.4 — Revoke the leftover tokens (after the first successful OIDC release)

1. npmjs.com → **Access Tokens**. Revoke the CLI login token created on
   2026-08-30 for the manual 1.3.0 publish, and any remaining classic or granular
   tokens with publish rights. Do not paste token values anywhere, including into
   a commit, an issue, or a chat.
2. Then npmjs.com → each package → **Settings** → **Publishing access** →
   **Require two-factor authentication and disallow tokens**.
   Per npm's documentation: *"The 'disallow tokens' setting only affects
   traditional token authentication. Your trusted publishers will continue to work
   normally, as they use OIDC tokens."* Enable it only **after** a release has
   gone out through OIDC — turning it on first removes the break-glass path in §5
   before the replacement is proven.

### 3.5 — Do not rename the workflow

`publish.yml` is part of the npm-side credential. Renaming or moving the file
silently revokes publishing for both packages, and the failure surfaces only at
the next release. If it must ever be renamed, update §3.2 and §3.3 in the same
change.

---

## 4. Security invariants

Every row names the step in `.github/workflows/publish.yml` that enforces it.
Grep for the step name; if it is not there, the invariant is not enforced.

| # | Invariant | Enforced by (step name in `publish.yml`) | What fails |
|---|---|---|---|
| 1 | No long-lived credential: no `NPM_TOKEN`, no `NODE_AUTH_TOKEN`, no `registry-url`, no `.npmrc` write | The absence itself, plus `permissions: {}` at workflow level; `setup-node` is configured without `registry-url` | Nothing to steal from a compromised runner or a malicious dependency |
| 2 | No attacker-choosable trigger | `on: push: tags: ['v[0-9]+.[0-9]+.[0-9]+']` — no `pull_request`, no `push: branches`, no `workflow_dispatch` | A fork PR cannot start this workflow at all; no free-ref dispatch exists |
| 3 | Tag authority: annotated tag, on a `main` ancestor, building exactly that commit, matching both manifests | *Assert the tag is annotated and resolve its commit* · *Assert the checked-out tree is the tagged commit* · *Assert the tagged commit is an ancestor of origin/main* · *Assert both package versions equal the tag* | All four run in `verify`, before any job that can reach the environment or a credential. The commit is resolved with `git rev-parse "refs/tags/<tag>^{commit}"` and **not** taken from `GITHUB_SHA`: for a pushed annotated tag that variable can carry the SHA of the tag OBJECT, which `git merge-base --is-ancestor` would reject on every legitimate release |
| 4 | No republish, ever; no `--force` | *Assert neither version is already published* in `verify`, then *Re-assert @frihet/sdk is not already published* / *Re-assert frihet is not already published* inside each publish job — all four call `publish-readback.mjs --assert-absent` | A re-pushed tag stops in `verify`; a GitHub "re-run failed jobs", which reuses `verify`'s cached success, stops inside the publish job before `npm publish` runs. The gate is **fail-closed**: it exits 0 only when the registry document was actually retrieved *and* the version is missing from it, so an outage, a 5xx or a DNS failure blocks the release instead of being read as "not published" (which is what `npm view … 2>/dev/null` would do) |
| 5 | Ordering SDK → CLI, and the CLI's dependency is an exact version | `needs: publish-sdk` · *Assert the registry already serves the SDK at this version* (bounded poll) · *Assert the packed CLI depends on the exact SDK version* and *Re-assert the packed CLI depends on the exact SDK version* (read out of the packed tarball, not `package.json`) | A CLI whose `@frihet/sdk` dependency 404s, or still carries `workspace:*`, is never published |
| 6 | Provenance, explicitly | *Publish @frihet/sdk* / *Publish frihet* use `--provenance --access public`; *Read the registry back* passes `--require-attestations` | If provenance cannot be produced the publish errors instead of silently downgrading; if the registry records no attestation the readback exits 3 |
| 7 | Fail closed on readback mismatch | *Read the registry back* → `scripts/publish-readback.mjs` | Asserts version present, `dist.integrity` == sha512 of the local tarball, the served tarball re-hashes to it, `dist-tags.latest` == version, attestations present, exact dependency. Any mismatch → exit 3 |
| 8 | Human gate | `environment: npm-publish` on `publish-sdk` and `publish-cli` | Required reviewer + `v*` tag restriction. Until the environment exists the job waits or fails; removing this key to unblock a release removes the gate |
| 9 | Post-publish proof | *Publish-drift check (strict)* (`--expect-in-sync`, no `--allow-pending`) · *Clean install from the public registry* | Published bytes must rebuild from this source, `npx frihet --version` must equal the version, and `CapabilityUnavailableError` must import from the published SDK |
| 10 | Least privilege | `permissions: {}` at workflow level; per-job `permissions:`; `id-token: write` only on `publish-sdk` and `publish-cli`; `concurrency: { group: publish, cancel-in-progress: false }` (workflow-wide, deliberately not keyed on the ref, so two different tags cannot release concurrently either) | `verify` and `post-publish` never hold an OIDC credential; no two releases can interleave, and a release cannot be cancelled between the two publishes |

### Why a tarball and not a package directory

`npm publish` does not rewrite pnpm's `workspace:*` protocol; `pnpm pack` does
(verified against the published 1.3.0 CLI tarball, whose manifest reads
`"@frihet/sdk": "1.3.0"`). So the workflow publishes the `pnpm pack` output. This
is supported: npm's `publish` documentation lists "a gzipped tarball containing
such a folder" as a valid package spec, and provenance's prerequisites
(`ensureProvenanceGeneration` in `libnpmpublish`) gate on the CI provider, the
OIDC token and `--access public` — never on the spec being a directory. A tarball
spec also skips `prepublishOnly` (npm's own comment: *"only run scripts for
directory type publishes"*), so nothing can rebuild between the bytes the
workflow hashed and the bytes npm uploads.

---

## 5. Break-glass (OIDC unavailable)

If npm's OIDC path is down or misconfigured and a release genuinely cannot wait,
the fallback is the manual procedure used for 1.3.0 — **not** a bypass-2FA token,
which GitHub restricted on 2026-07-31 and is eliminating for direct publishing by
January 2027.

```sh
pnpm install --frozen-lockfile && pnpm build
( cd packages/sdk && pnpm pack --pack-destination ../../release-artifacts )
( cd packages/cli && pnpm pack --pack-destination ../../release-artifacts )

# Byte proof BEFORE publishing the CLI:
tar -xOzf release-artifacts/frihet-X.Y.Z.tgz package/package.json   # "@frihet/sdk": "X.Y.Z"

# In a real TTY (npm 12 opens a browser for the passkey). SDK first, CLI after.
# The --assert-absent gate is the same no-republish check the workflow runs; it
# fails closed if the registry cannot be reached, so an outage cannot be mistaken
# for "this version is free".
node scripts/publish-readback.mjs --assert-absent --package @frihet/sdk --version X.Y.Z
npx npm@12 publish ./release-artifacts/frihet-sdk-X.Y.Z.tgz --access public

node scripts/publish-readback.mjs --assert-absent --package frihet --version X.Y.Z
npx npm@12 publish ./release-artifacts/frihet-X.Y.Z.tgz --access public
```

Then, mandatorily:

```sh
node scripts/publish-readback.mjs --package @frihet/sdk --version X.Y.Z \
  --tarball ./release-artifacts/frihet-sdk-X.Y.Z.tgz
node scripts/publish-readback.mjs --package frihet --version X.Y.Z \
  --tarball ./release-artifacts/frihet-X.Y.Z.tgz --expect-dependency @frihet/sdk=X.Y.Z
pnpm build && node scripts/check-publish-drift.mjs --expect-in-sync
```

Note the omission: `--require-attestations` is **not** passed here, because a
manual publish from a laptop produces no provenance (this is why `1.3.0` has no
`dist.attestations`). A break-glass release is therefore a release with weaker
supply-chain evidence, and should be followed by a normal OIDC release as soon as
the path is available.

---

## 6. What this does **not** do

- **It does not update `scripts/publish-pins.json`.** The reproducibility pin is a
  human assertion about which commit produces the published bytes; the workflow
  proves the assertion (`--expect-in-sync`) but does not write it. Commit the pin
  yourself after a green release (§2.6).
- **It does not create a GitHub Release or release notes.** Only the git tag and
  the npm publish.
- **It does not work before the owner steps exist.** Without the npm-side trusted
  publisher (§3.2/§3.3), `npm publish` fails at authentication and nothing is
  published; without the `npm-publish` environment (§3.1), the publish jobs cannot
  run. Both are fail-closed: no partial publish is possible.
- **It cannot publish an older maintenance line.** *Read the registry back*
  asserts `dist-tags.latest == version`, so publishing e.g. `1.2.1` after `1.3.0`
  would fail the readback *after* the package reached the registry. npm itself
  also refuses to implicitly apply `latest` when a higher version exists. This is
  a known limitation, left in deliberately rather than weakened: releasing a
  maintenance line needs an explicit `--tag` on the publish and a matching option
  on the readback, and should be designed when it is actually needed.
- **It does not verify the provenance attestation cryptographically.**
  `--require-attestations` asserts that the registry records an attestation for
  the version — what an outside caller can observe. Verifying the signature chain
  is `npm audit signatures`, which this workflow does not run.
- **It has never run end to end.** At the time this file was written the npm-side
  trusted publisher and the `npm-publish` environment did not exist, so the
  workflow has been linted (`actionlint`, clean) and its scripts tested against the
  immutable 1.3.0 release, but no release has gone through it.
