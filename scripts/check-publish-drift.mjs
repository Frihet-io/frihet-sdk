#!/usr/bin/env node
/**
 * Publish-drift detector — makes "merged but never published" visible.
 *
 * Authority: this repo's builds are byte-reproducible. tsup/esbuild output for a
 * pinned toolchain (frozen lockfile) is deterministic, and the only version-
 * dependent byte is injected through tsup's `define`. So the published tarball's
 * `dist/**` can be compared byte-for-byte against a local build of the same
 * source. That is a stronger authority than npm's `gitHead`, which this registry
 * does not expose for either package (verified 2026-08-26: `gitHead` is absent
 * from every published manifest of @frihet/sdk and frihet).
 *
 * The reproducibility premise is not assumed — `.github/workflows/publish-drift.yml`
 * re-proves it every run against `scripts/publish-pins.json` before trusting a
 * verdict. If a rebuild of a pinned published commit stops matching its tarball,
 * the gate fails closed rather than emitting a verdict it cannot justify.
 *
 * SCOPE (stated, not implied): compares `dist/**` only. README.md, CHANGELOG.md
 * and LICENSE ship in the tarball but are documentation — an unpublished doc edit
 * is not capability drift and must not turn this gate red. Tests never reach
 * `dist` at all. A green here means "published bytes match this source", not
 * "the tarball is identical".
 *
 * Exit codes:
 *   0  every package IN_SYNC (or PENDING_PUBLISH under --allow-pending)
 *   1  DIST_MISMATCH  — published version's bytes != this source. Bump the version.
 *   2  PENDING_PUBLISH — version merged to main was never published (the drift).
 *   3  fail-closed    — could not establish a verdict. Never silently green.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const REGISTRY = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';

const args = new Set(process.argv.slice(2));
const ALLOW_PENDING = args.delete('--allow-pending');
const EXPECT_IN_SYNC = args.delete('--expect-in-sync');
if (args.size > 0) {
  // An unknown flag must never be read as a weaker mode.
  failClosed(`unknown argument(s): ${[...args].join(' ')}`);
}

/** Fail-closed exit. Any path that cannot justify a verdict lands here. */
function failClosed(reason) {
  console.error(`\n[publish-drift] FAIL-CLOSED: ${reason}`);
  console.error('[publish-drift] No verdict could be established. Treating as drift.');
  process.exit(3);
}

/** Recursively list files under `dir`, returned as sorted repo-relative POSIX paths. */
function listFiles(dir) {
  const out = [];
  const walk = (cur) => {
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(cur, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

function sha512Base64(buf) {
  return createHash('sha512').update(buf).digest('base64');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

/**
 * Discover publishable packages from the filesystem, never from a hardcoded list:
 * a new package cannot escape this gate by not being added to an array, and an
 * existing one cannot be removed from coverage without deleting it from the repo.
 */
function discoverPackages() {
  let dirs;
  try {
    dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch (err) {
    failClosed(`cannot read ${PACKAGES_DIR}: ${err.message}`);
  }
  const pkgs = [];
  for (const d of dirs) {
    const manifestPath = join(PACKAGES_DIR, d.name, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    if (manifest.private === true) continue;
    if (!manifest.name || !manifest.version) {
      failClosed(`${manifestPath} is publishable but has no name/version`);
    }
    pkgs.push({ dir: join(PACKAGES_DIR, d.name), name: manifest.name, version: manifest.version });
  }
  if (pkgs.length === 0) failClosed('discovered zero publishable packages under packages/');
  return pkgs;
}

/** Download + integrity-verify + extract the published tarball's dist/ tree. */
async function fetchPublishedDist(pkg, meta) {
  const dist = meta.dist ?? {};
  if (!dist.tarball) failClosed(`${pkg.name}@${pkg.version}: registry manifest has no dist.tarball`);
  if (!dist.integrity && !dist.shasum) {
    failClosed(`${pkg.name}@${pkg.version}: registry manifest has no integrity or shasum to verify against`);
  }

  const res = await fetch(dist.tarball);
  if (!res.ok) throw new Error(`GET ${dist.tarball} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Verify the bytes before trusting them: a poisoned cache or a MITM must not
  // be able to manufacture a false green.
  if (dist.integrity) {
    const [algo, expected] = dist.integrity.split('-');
    if (algo !== 'sha512') failClosed(`${pkg.name}@${pkg.version}: unsupported integrity algo "${algo}"`);
    const actual = sha512Base64(buf);
    if (actual !== expected) {
      failClosed(`${pkg.name}@${pkg.version}: tarball integrity mismatch (expected ${expected}, got ${actual})`);
    }
  } else {
    const actual = createHash('sha1').update(buf).digest('hex');
    if (actual !== dist.shasum) {
      failClosed(`${pkg.name}@${pkg.version}: tarball shasum mismatch (expected ${dist.shasum}, got ${actual})`);
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), 'publish-drift-'));
  const tgz = join(tmp, 'pkg.tgz');
  writeFileSync(tgz, buf);
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', tmp], { stdio: 'pipe' });
  } catch (err) {
    failClosed(`${pkg.name}@${pkg.version}: cannot extract tarball: ${err.message}`);
  }
  return { root: join(tmp, 'package'), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

function compareDist(pkg, publishedRoot) {
  const localDist = join(pkg.dir, 'dist');
  const publishedDist = join(publishedRoot, 'dist');

  try {
    if (!statSync(localDist).isDirectory()) throw new Error('not a directory');
  } catch {
    failClosed(`${pkg.name}: ${relative(REPO_ROOT, localDist)} is missing — run \`pnpm build\` before this gate`);
  }

  const localFiles = listFiles(localDist);
  const publishedFiles = listFiles(publishedDist);

  // Vacuous-green guard: a comparison that compared nothing is not a pass.
  if (localFiles.length === 0) failClosed(`${pkg.name}: local dist/ is empty — nothing to compare`);
  if (publishedFiles.length === 0) failClosed(`${pkg.name}: published tarball has no dist/ — cannot compare`);

  const onlyLocal = localFiles.filter((f) => !publishedFiles.includes(f));
  const onlyPublished = publishedFiles.filter((f) => !localFiles.includes(f));
  const shared = localFiles.filter((f) => publishedFiles.includes(f));

  const differing = [];
  for (const f of shared) {
    const a = readFileSync(join(localDist, f));
    const b = readFileSync(join(publishedDist, f));
    if (!a.equals(b)) differing.push({ file: f, local: a.length, published: b.length });
  }

  return { comparedCount: shared.length, onlyLocal, onlyPublished, differing };
}

async function main() {
  const packages = discoverPackages();
  console.log('[publish-drift] authority: byte-reproducible build vs published tarball dist/**');
  console.log('[publish-drift] scope: dist/** only (README/CHANGELOG/LICENSE and tests are out of scope by design)');
  console.log(`[publish-drift] registry: ${REGISTRY}`);
  console.log(`[publish-drift] packages discovered: ${packages.map((p) => p.name).join(', ')}\n`);

  const results = [];
  for (const pkg of packages) {
    let doc;
    try {
      doc = await fetchJson(`${REGISTRY}/${encodeURIComponent(pkg.name)}`);
    } catch (err) {
      failClosed(`${pkg.name}: registry lookup failed: ${err.message}`);
    }

    const versions = Object.keys(doc.versions ?? {});
    if (versions.length === 0) failClosed(`${pkg.name}: registry returned no versions`);
    const latest = doc['dist-tags']?.latest;

    if (!versions.includes(pkg.version)) {
      results.push({ pkg, status: 'PENDING_PUBLISH', latest, detail: `local ${pkg.version} is not on the registry (latest published: ${latest})` });
      continue;
    }

    const { root, cleanup } = await fetchPublishedDist(pkg, doc.versions[pkg.version]);
    try {
      const cmp = compareDist(pkg, root);
      if (cmp.comparedCount === 0) failClosed(`${pkg.name}: zero files compared — refusing to report a pass`);
      const clean = cmp.differing.length === 0 && cmp.onlyLocal.length === 0 && cmp.onlyPublished.length === 0;
      results.push({
        pkg,
        status: clean ? 'IN_SYNC' : 'DIST_MISMATCH',
        latest,
        detail: clean
          ? `${cmp.comparedCount} dist file(s) byte-identical to published ${pkg.version}`
          : formatMismatch(cmp),
      });
    } finally {
      cleanup();
    }
  }

  console.log('[publish-drift] verdicts:');
  for (const r of results) console.log(`  ${r.status.padEnd(16)} ${r.pkg.name}@${r.pkg.version}  — ${r.detail}`);
  console.log();

  const mismatched = results.filter((r) => r.status === 'DIST_MISMATCH');
  const pending = results.filter((r) => r.status === 'PENDING_PUBLISH');

  if (EXPECT_IN_SYNC) {
    const notInSync = results.filter((r) => r.status !== 'IN_SYNC');
    if (notInSync.length > 0) {
      failClosed(`--expect-in-sync: ${notInSync.map((r) => `${r.pkg.name}=${r.status}`).join(', ')}`);
    }
    console.log('[publish-drift] reproducibility pin holds: published bytes rebuild exactly from this commit.');
    process.exit(0);
  }

  if (mismatched.length > 0) {
    console.error('[publish-drift] DIST_MISMATCH — published bytes for this version do not match this source.');
    console.error('[publish-drift] Bump the package version in this same PR; do not republish over a released version.');
    process.exit(1);
  }

  if (pending.length > 0) {
    const names = pending.map((r) => `${r.pkg.name}@${r.pkg.version}`).join(', ');
    if (ALLOW_PENDING) {
      console.log(`[publish-drift] PENDING_PUBLISH (non-blocking on PRs): ${names}`);
      console.log('[publish-drift] These versions must reach npm before this drift closes.');
      process.exit(0);
    }
    console.error(`[publish-drift] PENDING_PUBLISH — merged but never published: ${names}`);
    console.error('[publish-drift] main declares a version the registry has never seen. Publish it or revert the bump.');
    process.exit(2);
  }

  console.log('[publish-drift] OK — every published package matches its source.');
  process.exit(0);
}

function formatMismatch(cmp) {
  const parts = [];
  if (cmp.differing.length) parts.push(`${cmp.differing.length} file(s) differ: ${cmp.differing.map((d) => `${d.file} (local ${d.local}B vs published ${d.published}B)`).join('; ')}`);
  if (cmp.onlyLocal.length) parts.push(`only in local build: ${cmp.onlyLocal.join(', ')}`);
  if (cmp.onlyPublished.length) parts.push(`only in published tarball: ${cmp.onlyPublished.join(', ')}`);
  return parts.join(' | ');
}

main().catch((err) => failClosed(err?.stack ?? String(err)));
