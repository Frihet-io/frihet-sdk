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
closes with a strict `check-publish-drift.mjs --expect-in-sync` (the published
`dist/**` rebuilds exactly from this source), a re-pack of both packages from the
tag whose sha512 must equal the registry's `dist.integrity` (the proof that the
*whole* tarball — manifest, README, CHANGELOG, LICENSE and all — rebuilds, not
just `dist/**`), and a clean install of both packages from the public registry. Every link is a job or step that fails the run — none is a claim
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

   **What the reviewer must check before approving.** A tag push runs the workflow
   file *from the tag*, so the run you are approving may not be executing the
   `publish.yml` that is on `main`. On the run page the header shows the tag and,
   under it, the commit it resolves to; the run's **⋯** menu → **View workflow file**
   shows the exact `publish.yml` that is executing. Confirm that commit is the one
   you tagged on `main` and that the workflow file is the reviewed one. This check
   and the §3.5 tag ruleset are the only two controls on that path — no step inside
   the workflow can verify itself.
5. **Watch it finish.** `publish-sdk` → `publish-cli` → `post-publish`. If
   `post-publish` is red the packages are *published but unproven*: read the
   failure before doing anything else, and do not tag another version to "fix" it
   until you know which assertion failed.

   **If a job fails *after* something was already published**, re-run the failed
   jobs. The publish gate is `--assert-absent-or-identical`: it passes when the
   version is absent, and also when it is already there with **byte-identical**
   content, in which case it sets `already_published=true` and the `npm publish`
   step is skipped by an `if:` guard rather than attempting a republish npm would
   reject. Already published with **different** bytes is still a hard failure —
   that is a genuine republish attempt and the version must be bumped.
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
3. Tick **Required reviewers** → add the repository owner **`berthelius`** as a
   **user** (not a team) → **Save protection rules**
4. Under **Deployment branches and tags**, choose **Selected branches and tags** →
   **Add deployment branch or tag rule** → select type **Tag** → pattern exactly
   `v*` → **Add rule**. Add **no branch rules at all**.
5. Do **not** add any environment secret. This environment carries no credential;
   its only job is to require a human and to restrict deployments to tags.

`verify` asserts this configuration exactly and fails the release otherwise: at
least one required reviewer, **every** reviewer of type `User` with login equal to
`REQUIRED_REVIEWER_LOGIN` (`berthelius`, set in `publish.yml`), and **every**
deployment policy of type `tag` with at least one named exactly `v*`. A team
reviewer, an extra user, or any branch policy is a failure — the point is that
widening the gate must be a deliberate edit to `publish.yml`, not a quiet click in
the settings UI. If the owner's login ever changes, update `REQUIRED_REVIEWER_LOGIN`
in the same PR.

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

### 3.5 — Restrict who may create `v*` tags (this is the real authority)

A workflow triggered by a tag push runs the workflow file **from the pushed ref**.
Anyone who can create a `v[0-9]+.[0-9]+.[0-9]+` tag can therefore point it at a
commit carrying a rewritten `publish.yml` with none of §4's checks in it. Nothing
inside this repository can prevent that — it is the trust boundary, not a gap.

1. GitHub → `Frihet-io/frihet-sdk` → **Settings** → **Rules** → **Rulesets** →
   **New ruleset** → **New tag ruleset**
2. Name it `release-tags`, set **Enforcement status** to **Active**
3. **Target tags** → **Add target** → **Include by pattern** → `v*`
4. Under **Rules** tick **Restrict creations**, **Restrict updates** and
   **Restrict deletions**
5. **Bypass list** → **Add bypass** → the repository owner only
6. **Create**

### 3.6 — Do not rename the workflow

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
| 4 | No republish, ever; no `--force` | *Assert neither version is already published* in `verify`, then *Re-assert @frihet/sdk is not already published (resumable)* / *Re-assert frihet is not already published (resumable)* inside each publish job (see invariant 14 for why those two use `--assert-absent-or-identical`) | A re-pushed tag stops in `verify`; a GitHub "re-run failed jobs", which reuses `verify`'s cached success, stops inside the publish job before `npm publish` runs. The gate is **fail-closed**: it exits 0 only when the registry document was actually retrieved *and* the version is missing from it, so an outage, a 5xx or a DNS failure blocks the release instead of being read as "not published" (which is what `npm view … 2>/dev/null` would do). The document is also shape-checked before it is believed (`assertPackumentShape`): `name` must be the package asked about, `versions` must be a plain non-array object, every key strict semver, every entry's `version` equal to its key — otherwise a crafted source whose `versions` is an *array* would report a listed version as absent, since `typeof [] === "object"` and `Object.keys(["1.4.0"])` is `["0"]` |
| 5 | Ordering SDK → CLI, and the CLI's dependency is an exact version | `needs: publish-sdk` · *Assert the registry already serves the SDK at this version* (bounded poll) · *Assert the packed CLI depends on the exact SDK version* and *Re-assert the packed CLI depends on the exact SDK version* (read out of the packed tarball, not `package.json`) | A CLI whose `@frihet/sdk` dependency 404s, or still carries `workspace:*`, is never published |
| 6 | Provenance, explicitly | *Publish @frihet/sdk* / *Publish frihet* use `--provenance --access public`; *Read the registry back* passes `--require-attestations` | If provenance cannot be produced the publish errors instead of silently downgrading; if the registry records no attestation the readback exits 3 |
| 7 | Fail closed on readback mismatch | *Read the registry back* → `scripts/publish-readback.mjs` | Asserts version present, `dist.integrity` == sha512 of the local tarball, the served tarball re-hashes to it, `dist-tags.latest` == version, attestations present, exact dependency. Any mismatch → exit 3 |
| 8 | Human gate, **verified rather than assumed**, and verified *specifically* | `environment: npm-publish` on `publish-sdk` and `publish-cli`, **plus** *Assert the npm-publish environment is protected* in `verify` | Naming an environment that does not exist does **not** make a job wait — GitHub auto-creates it with **no protection rules** and the job runs. So the `environment:` key alone proves nothing. `verify` reads both `/environments/npm-publish` and `/deployment-branch-policies` and fails unless: it exists; a `required_reviewers` rule has ≥1 reviewer; **every** reviewer is type `User` with login `REQUIRED_REVIEWER_LOGIN`; `custom_branch_policies == true`; **every** policy is type `tag`; and one is named exactly `v*`. Any non-200 fails. "Some reviewer, some policy" is not the gate — the named owner and tags-only is |
| 9 | Post-publish proof | *Publish-drift check (strict)* (`--expect-in-sync`, no `--allow-pending`) · *Clean install from the public registry* | Published bytes must rebuild from this source, `npx frihet --version` must equal the version, and `CapabilityUnavailableError` must import from the published SDK |
| 10 | Least privilege | `permissions: {}` at workflow level; per-job `permissions:`; `id-token: write` only on `publish-sdk` and `publish-cli`; `concurrency: { group: publish, cancel-in-progress: false }` (workflow-wide, deliberately not keyed on the ref, so two different tags cannot release concurrently either) | `verify` and `post-publish` never hold an OIDC credential; no two releases can interleave, and a release cannot be cancelled between the two publishes |
| 11 | Packed identity: a tarball is the package npm will read it as, and can only be read one way | *Assert each packed tarball really is the package it is named for* (in `verify`) · *Assert the downloaded tarball really is @frihet/sdk* / *Assert the downloaded tarball really is frihet* (in each publish job, on the bytes that job actually holds) — all call `publish-readback.mjs --assert-tarball-identity` | npm takes name and version from the manifest **inside** the tarball, not from the filename. Reading `package/package.json` is not enough either: pacote extracts with `strip=1` and the **last** matching entry wins, so an archive with both `package/package.json` (`@frihet/sdk`) and `alternate/package.json` (`frihet`) reads one way to `tar -xO` and publishes the other — confirmed against npm 11.19.1, which dry-runs that archive as `frihet@1.4.0`. So the layout is validated first: every entry under `package/`, exactly one manifest, regular files and directories only (no symlinks, hardlinks or devices), no absolute paths or `..`, ≤10 000 entries and ≤25 MiB uncompressed. Only then is the manifest parsed |
| 12 | Pinned supply chain and pinned toolchain | Every `uses:` is a full 40-hex commit SHA with a `# vX.Y.Z` comment; `PNPM_BUILD_VERSION` (9.15.4) and `NODE_BUILD_VERSION` (22.22.2) pin the build toolchain in `verify` and `post-publish`, `NODE_PUBLISH_VERSION` (24.20.0) the publish one | A moving tag (`@v4`) is a mutable pointer its owner can repoint at new code, and that code would run inside a job holding `id-token: write` and the release tarballs. Re-pin deliberately; do not "update to latest" in a release PR. The toolchain pins matter for the same reason: 1.3.0's published bytes were produced by pnpm 9.15.4 on Node 22.22.2, and both the drift check and the re-pack proof compare BYTES, so a floating minor that changes tsup/esbuild output would turn a correct release red |
| 13 | The **whole** published tarball rebuilds from the tag | *Prove the FULL published tarballs rebuild from this tag* (in `post-publish`) | `check-publish-drift.mjs` compares `dist/**` only, by design — an unpublished doc edit is not capability drift. This step re-packs both packages from the tag and readbacks the fresh files, so their sha512 must equal the registry's `dist.integrity`: manifest, README, CHANGELOG, LICENSE and every dist file at once. Verified reproducible on `dba101c` with the pinned toolchain before it was made a gate |
| 14 | Resumable without weakening | *Re-assert @frihet/sdk is not already published (resumable)* / *Re-assert frihet is not already published (resumable)* → `--assert-absent-or-identical`, with the publish step guarded by `if: steps.<gate>.outputs.already_published != 'true'` | A transient failure after a successful publish used to leave the release wedged: republishing is impossible and the gate would fail forever, tempting someone to edit it out. Now a re-run passes only when the registry holds **byte-identical** content, skips the publish, and continues. Different bytes is still exit 3 |

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
node scripts/publish-readback.mjs --assert-tarball-identity --package @frihet/sdk --version X.Y.Z \
  --tarball ./release-artifacts/frihet-sdk-X.Y.Z.tgz
node scripts/publish-readback.mjs --assert-absent --package @frihet/sdk --version X.Y.Z
npx npm@12 publish ./release-artifacts/frihet-sdk-X.Y.Z.tgz --access public

node scripts/publish-readback.mjs --assert-tarball-identity --package frihet --version X.Y.Z \
  --tarball ./release-artifacts/frihet-X.Y.Z.tgz
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
- **It cannot defend against a rewritten workflow on the tag.** GitHub runs a
  tag-triggered workflow from the pushed ref, so an actor with tag-creation rights
  can point `vX.Y.Z` at a commit whose `publish.yml` has none of §4's checks. No
  step in this file can detect that, because the replaced file *is* the file that
  would be doing the detecting. The two controls that actually bound this are both
  human and both outside the workflow: the §3.5 tag ruleset restricting `v*`
  creation to the owner, and the `npm-publish` reviewer confirming, before
  approving, that the run's commit and workflow file are the ones reviewed on
  `main` (§2.4). Treat those two as the real security perimeter.
- **The drift check and the re-pack proof answer different questions.**
  `check-publish-drift.mjs --expect-in-sync` compares `dist/**` only, on purpose:
  an unpublished README edit is not capability drift and must not turn that gate
  red. The claim that the *entire* published tarball rebuilds from the tag is
  proved separately, by *Prove the FULL published tarballs rebuild from this tag*
  in `post-publish`. Neither one subsumes the other; both run.
- **It does not verify the npm-side trusted-publisher configuration.** `verify`
  proves the *GitHub* environment is protected; whether npm's Trusted Publisher
  entries point at this repository, this filename and this environment is only
  observable at publish time, where a mismatch fails authentication.
- **It has never run end to end.** At the time this file was written the npm-side
  trusted publisher and the `npm-publish` environment did not exist, so the
  workflow has been linted (`actionlint`, clean) and its scripts tested against the
  immutable 1.3.0 release, but no release has gone through it.
