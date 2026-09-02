#!/usr/bin/env node
/**
 * Publish readback — proves that what the registry now serves is byte-for-byte
 * what this workflow published, and nothing else.
 *
 * Authority: `npm publish` reporting success is a claim about a request, not about
 * the registry's resulting state. A CDN can serve a stale manifest, a republish
 * can land underneath, an `--access` mistake can leave a package unreadable. So
 * after every publish this reads the registry back over the network and compares
 * it against the exact local tarball whose bytes were handed to `npm publish`.
 *
 * SCOPE (stated, not implied): this verifies the REGISTRY MANIFEST and the
 * TARBALL BYTES for one version of one package. It does not by itself prove the
 * bytes rebuild from source: `check-publish-drift.mjs` proves that for `dist/**`
 * only, and the FULL tarball (manifest, README, CHANGELOG, LICENSE and all) is
 * proved in the `post-publish` job by re-packing from the tag and running this
 * script against the freshly packed file, so that a byte difference anywhere in
 * the archive fails the release. It does not cryptographically verify the
 * provenance attestation —
 * `--require-attestations` asserts only that the registry records an attestation
 * for this version, which is what a caller can observe from outside npm.
 *
 * READBACK MODE (default) — assertions, all of which must pass for exit 0:
 *   1. the version exists in the registry document
 *   2. `dist.integrity` is sha512 and equals the sha512 of the LOCAL tarball
 *   3. the tarball the registry serves downloads and re-hashes to that same sha512
 *   4. `dist-tags.latest` === this version
 *   5. `dist.attestations` is present            (only with --require-attestations)
 *   6. each --expect-dependency matches EXACTLY  (no range, no `workspace:`)
 *
 * TARBALL-IDENTITY MODE (`--assert-tarball-identity`) — npm derives a package's
 * IDENTITY from the manifest INSIDE the tarball, not from its filename. A file
 * named `frihet-sdk-1.4.0.tgz` whose manifest says `name: frihet` would publish
 * the CLI out of the SDK job: CLI-first, irreversibly, having passed every
 * filename-based check on the way.
 *
 * Reading `package/package.json` is NOT sufficient, and an earlier version of
 * this script was wrong about that. pacote extracts an npm tarball with
 * `strip=1` and the LAST matching entry wins, so an archive containing BOTH
 * `package/package.json` (`@frihet/sdk`) AND `alternate/package.json` (`frihet`)
 * makes `tar -xO package/package.json` report one identity while npm publishes
 * the other. Verified against npm 11.19.1: such a tarball dry-runs as
 * `frihet@1.4.0`. So the whole archive LAYOUT is validated first — every entry
 * under `package/`, exactly one manifest, regular files and directories only,
 * bounded entry count and uncompressed size — and only then is the manifest
 * parsed. A layout this script cannot fully account for is exit 3.
 *
 * RESUME MODE (`--assert-absent-or-identical`) — a release that published the
 * SDK and then failed on a transient readback must be resumable without either
 * republishing (impossible) or hand-editing the gate. Exits 0 when the version
 * is absent (nothing published yet) OR present with byte-identical `dist.integrity`
 * and served tarball (this exact release already went out). Present with
 * DIFFERENT bytes is exit 3. It reports `already_published=true|false` on
 * `$GITHUB_OUTPUT` so the caller can skip the publish step rather than attempt a
 * republish npm would reject.
 *
 * ABSENCE MODE (`--assert-absent`) — the pre-publish "never republish" gate.
 * Exits 0 ONLY when the registry document was successfully retrieved AND the
 * version is absent from it. This is deliberately not `npm view … 2>/dev/null`:
 * that idiom reads ANY non-zero exit as "absent", so a DNS failure, a 5xx or a
 * registry outage would wave a republish through. Here, an unreachable registry,
 * an HTTP error, unparseable JSON, or a package-level 404 are all exit 3 — an
 * unanswerable question is not a "no".
 *
 * Exit codes:
 *   0  every assertion passed
 *   3  fail-closed — any assertion failed, any network/parse error, any unknown
 *      argument. There is no other non-zero exit: a readback that cannot be
 *      completed is indistinguishable from a readback that failed.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_REGISTRY = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';

/** Fail-closed exit. Every path that cannot justify a pass lands here. */
export function failClosed(reason) {
  console.error(`\n[publish-readback] FAIL-CLOSED: ${reason}`);
  console.error('[publish-readback] The registry does not demonstrably serve what was published.');
  process.exit(3);
}

export function sha512Integrity(buf) {
  return `sha512-${createHash('sha512').update(buf).digest('base64')}`;
}

/* ------------------------------------------------------------------ *
 * Pure assertion helpers. Each returns an `ok` line on success and
 * throws an Error on failure, so they are drivable from tests without
 * a network and without a process exit.
 * ------------------------------------------------------------------ */

/** 1. The version exists in the registry document. */
export function assertVersionPresent(doc, name, version) {
  const versions = Object.keys(doc?.versions ?? {});
  if (versions.length === 0) throw new Error(`${name}: registry document lists no versions at all`);
  if (!versions.includes(version)) {
    const latest = doc['dist-tags']?.latest ?? '(none)';
    throw new Error(`${name}@${version} is not on the registry (latest published: ${latest})`);
  }
  return `ok version ${name}@${version} present in registry document`;
}

/** 2. `dist.integrity` is sha512 and matches the local tarball. */
export function assertIntegrityMatchesLocal(entry, name, version, localIntegrity) {
  const integrity = entry?.dist?.integrity;
  if (!integrity) throw new Error(`${name}@${version}: registry manifest has no dist.integrity`);
  if (!integrity.startsWith('sha512-')) {
    throw new Error(`${name}@${version}: dist.integrity is not sha512 ("${integrity.split('-')[0]}")`);
  }
  if (integrity !== localIntegrity) {
    throw new Error(
      `${name}@${version}: registry dist.integrity ${integrity} != local tarball ${localIntegrity}`
    );
  }
  return `ok integrity ${integrity} matches local tarball`;
}

/** 3. The served tarball re-hashes to the manifest's integrity. */
export function assertServedTarballMatches(entry, name, version, servedBuf) {
  const expected = entry?.dist?.integrity;
  const actual = sha512Integrity(servedBuf);
  if (actual !== expected) {
    throw new Error(
      `${name}@${version}: tarball served by the registry hashes to ${actual}, manifest says ${expected}`
    );
  }
  return `ok served tarball (${servedBuf.length} bytes) re-hashes to ${actual}`;
}

/** 4. `dist-tags.latest` points at this version. */
export function assertLatestTag(doc, name, version) {
  const latest = doc?.['dist-tags']?.latest;
  if (latest !== version) {
    throw new Error(`${name}: dist-tags.latest is ${latest ?? '(unset)'}, expected ${version}`);
  }
  return `ok dist-tags.latest === ${version}`;
}

/** 5. The registry records a provenance attestation for this version. */
export function assertAttestations(entry, name, version) {
  const att = entry?.dist?.attestations;
  if (!att || typeof att !== 'object') {
    throw new Error(
      `${name}@${version}: no dist.attestations on the registry manifest — published without provenance`
    );
  }
  if (!att.url) throw new Error(`${name}@${version}: dist.attestations has no url`);
  const predicate = att.provenance?.predicateType ?? '(unspecified predicateType)';
  return `ok attestations present (${predicate})`;
}

/**
 * 6. Each expected dependency is EXACTLY the given version string.
 * Exact equality is the point: `^1.3.0`, `>=1.3.0` and `workspace:*` all fail,
 * because a CLI that floats onto an SDK it was never tested against — or one
 * that ships an unrewritten workspace protocol and cannot install at all — is
 * precisely the failure this readback exists to catch.
 */
export function assertExactDependencies(entry, name, version, expectations) {
  const deps = entry?.dependencies ?? {};
  const lines = [];
  for (const [depName, expected] of expectations) {
    const actual = deps[depName];
    if (actual === undefined) {
      throw new Error(`${name}@${version}: published manifest has no dependency "${depName}"`);
    }
    if (actual !== expected) {
      throw new Error(
        `${name}@${version}: dependencies["${depName}"] is "${actual}", expected exactly "${expected}"`
      );
    }
    lines.push(`ok dependency ${depName} === "${expected}" (exact, no range, no workspace protocol)`);
  }
  return lines;
}

/**
 * Strict semver, as npm records it in a packument key. Deliberately anchored and
 * deliberately narrow: this is the shape a registry key is allowed to have, not
 * a permissive range parser.
 */
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Refuse to reason about a document that is not shaped like a real packument.
 *
 * This exists because `typeof [] === 'object'` and `Object.keys(['1.4.0'])`
 * yields `['0']`: a document whose `versions` is an ARRAY would let a crafted
 * source (`--registry 'data:application/json,…'`, a compromised mirror, a
 * proxy) report a version as absent while it is plainly listed. So `versions`
 * must be a plain non-array object, every key must be strict semver, every value
 * must be an object whose own `version` field equals its key, and the document's
 * `name` must be the package that was asked about.
 */
export function assertPackumentShape(doc, name) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`${name}: registry document is not an object`);
  }
  if (doc.name !== name) {
    throw new Error(`${name}: registry document reports name "${doc.name ?? '(missing)'}" — refusing to trust a document for a different package`);
  }
  const versions = doc.versions;
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    throw new Error(
      `${name}: registry document's "versions" is ${Array.isArray(versions) ? 'an array' : JSON.stringify(versions ?? null)}, not an object — cannot conclude anything from it`
    );
  }
  for (const [key, entry] of Object.entries(versions)) {
    if (!SEMVER_RE.test(key)) {
      throw new Error(`${name}: registry document has a non-semver version key "${key}"`);
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${name}: registry entry for ${key} is not an object`);
    }
    if (entry.version !== key) {
      throw new Error(`${name}: registry entry keyed ${key} declares version "${entry.version ?? '(missing)'}" — mismatched packument`);
    }
  }
  return `ok packument shape for ${name} (${Object.keys(versions).length} well-formed version(s))`;
}

/**
 * TARBALL-IDENTITY MODE. Reads `package/package.json` out of the gzipped tarball
 * and asserts the identity npm will actually use.
 */
export function assertManifestIdentity(manifest, expectedName, expectedVersion) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('tarball manifest is not an object');
  }
  if (manifest.name !== expectedName) {
    throw new Error(
      `tarball manifest declares name "${manifest.name ?? '(missing)'}", expected "${expectedName}" — npm publishes by MANIFEST identity, not by filename`
    );
  }
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `tarball manifest declares version "${manifest.version ?? '(missing)'}", expected "${expectedVersion}"`
    );
  }
  return `ok tarball manifest identity is ${expectedName}@${expectedVersion} (read from package/package.json inside the tgz)`;
}

/**
 * Bounds on a package tarball. The published 1.3.0 SDK is 530 KB uncompressed
 * across ~10 entries, so these are three orders of magnitude of headroom while
 * still refusing to decompress something unbounded.
 */
export const TARBALL_LIMITS = {
  maxUncompressedBytes: 25 * 1024 * 1024,
  maxEntries: 10_000,
};

/**
 * Validate the LAYOUT of an npm tarball before trusting anything inside it.
 *
 * `paths` comes from `tar -tzf` (authoritative for names) and `typeChars` from
 * the first column of `tar -tvzf` (the mode string's type character, which is
 * the same convention in GNU tar and bsdtar). They describe the same entries in
 * the same order; a length mismatch means the two listings disagree and is
 * itself fail-closed.
 *
 * The rule being enforced is "this archive can only be read one way". pacote
 * extracts with strip=1 and the last matching entry wins, so any second
 * top-level directory, any extra manifest, or any link entry creates a gap
 * between what this script reads and what npm publishes.
 */
export function assertTarballLayout({ paths, typeChars, uncompressedBytes }, tarballPath) {
  if (paths.length !== typeChars.length) {
    throw new Error(
      `${tarballPath}: tar listings disagree (${paths.length} names vs ${typeChars.length} type rows) — refusing to interpret it`
    );
  }
  if (paths.length === 0) throw new Error(`${tarballPath} is empty`);
  if (paths.length > TARBALL_LIMITS.maxEntries) {
    throw new Error(`${tarballPath}: ${paths.length} entries exceeds the ${TARBALL_LIMITS.maxEntries} limit`);
  }
  if (uncompressedBytes > TARBALL_LIMITS.maxUncompressedBytes) {
    throw new Error(
      `${tarballPath}: ${uncompressedBytes} uncompressed bytes exceeds the ${TARBALL_LIMITS.maxUncompressedBytes} limit`
    );
  }

  let manifestCount = 0;
  for (let i = 0; i < paths.length; i++) {
    const raw = paths[i];
    const type = typeChars[i];

    // Regular files and directories only. 'l' symlink, 'h' hardlink, and the
    // device/fifo types can all make an extractor and this script disagree.
    if (type !== '-' && type !== 'd') {
      throw new Error(`${tarballPath}: entry "${raw}" has archive type "${type}" — only regular files and directories are allowed`);
    }
    if (raw.startsWith('/')) {
      throw new Error(`${tarballPath}: entry "${raw}" is an absolute path`);
    }
    const normalized = raw.replace(/\/+$/, '');
    if (normalized === '' ) continue;
    const segments = normalized.split('/');
    if (segments.includes('..')) {
      throw new Error(`${tarballPath}: entry "${raw}" escapes the archive root with ".."`);
    }
    if (segments[0] !== 'package') {
      throw new Error(
        `${tarballPath}: entry "${raw}" is outside package/ — npm extracts with strip=1 and the LAST matching entry wins, so a second top-level directory can change which manifest is published`
      );
    }
    if (normalized === 'package/package.json') manifestCount++;
    // Any other entry that would become "package.json" after strip=1.
    else if (segments.length === 2 && segments[1] === 'package.json') {
      throw new Error(`${tarballPath}: entry "${raw}" is a second manifest after strip=1`);
    }
  }

  if (manifestCount !== 1) {
    throw new Error(`${tarballPath}: expected exactly one package/package.json, found ${manifestCount}`);
  }
  return `ok archive layout: ${paths.length} entries, all under package/, exactly one manifest, ${uncompressedBytes} uncompressed bytes`;
}

/** List an npm tarball's entries, their archive types, and its uncompressed size. */
export function readTarballListing(tarballPath) {
  const run = (args, input) => {
    try {
      return execFileSync(args[0], args.slice(1), {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(input ?? {}),
      });
    } catch (err) {
      throw new Error(`cannot list ${tarballPath}: ${err.message}`);
    }
  };
  const paths = run(['tar', '-tzf', tarballPath]).split('\n').filter((l) => l !== '');
  const verbose = run(['tar', '-tvzf', tarballPath]).split('\n').filter((l) => l !== '');
  const typeChars = verbose.map((line) => line.charAt(0));

  // Exact uncompressed size, which also bounds decompression itself.
  let uncompressedBytes;
  try {
    uncompressedBytes = Number(
      execFileSync('sh', ['-c', `gzip -dc "$1" | wc -c`, 'sh', tarballPath], {
        encoding: 'utf8',
        maxBuffer: 1024,
      }).trim()
    );
  } catch (err) {
    throw new Error(`cannot measure uncompressed size of ${tarballPath}: ${err.message}`);
  }
  if (!Number.isFinite(uncompressedBytes)) {
    throw new Error(`cannot measure uncompressed size of ${tarballPath}`);
  }
  return { paths, typeChars, uncompressedBytes };
}

/**
 * Validate the layout, then extract and parse the one manifest it is allowed to
 * contain. Layout first: parsing a manifest out of an archive that can be read
 * two ways tells you nothing about what npm will publish.
 */
export function readTarballManifest(tarballPath) {
  const listing = readTarballListing(tarballPath);
  const layoutLine = assertTarballLayout(listing, tarballPath);

  let raw;
  try {
    raw = execFileSync('tar', ['-xOzf', tarballPath, 'package/package.json'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(`cannot read package/package.json from ${tarballPath}: ${err.message}`);
  }
  if (!raw || raw.trim() === '') {
    throw new Error(`${tarballPath} contains no package/package.json`);
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(`package/package.json inside ${tarballPath} is not valid JSON: ${err.message}`);
  }
  return { manifest, layoutLine };
}

/**
 * ABSENCE MODE. The inverse of `assertVersionPresent`, and NOT simply its
 * negation: this one also refuses to answer when the document itself is not
 * trustworthy. A registry document with no `versions` object at all is a
 * malformed answer, not an empty one, so it fails rather than reporting absence.
 */
export function assertVersionAbsent(doc, name, version) {
  // Shape first: an absence read off a malformed or foreign document is not an
  // absence, it is a guess.
  assertPackumentShape(doc, name);
  const versions = Object.keys(doc.versions);
  if (versions.includes(version)) {
    throw new Error(
      `${name}@${version} is ALREADY published. Published versions are immutable — bump the version, never republish.`
    );
  }
  const latest = doc['dist-tags']?.latest ?? '(none)';
  return `ok ${name}@${version} is not on the registry (${versions.length} version(s) published, latest ${latest})`;
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

export function parseArgs(argv) {
  const out = {
    package: null,
    version: null,
    tarball: null,
    registry: DEFAULT_REGISTRY,
    requireAttestations: false,
    expectDependencies: [],
    assertAbsent: false,
    assertTarballIdentity: false,
    assertAbsentOrIdentical: false,
    pollAttempts: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const needValue = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case '--package': out.package = needValue(); break;
      case '--version': out.version = needValue(); break;
      case '--tarball': out.tarball = needValue(); break;
      case '--registry': out.registry = needValue(); break;
      case '--require-attestations': out.requireAttestations = true; break;
      case '--assert-absent': out.assertAbsent = true; break;
      case '--assert-tarball-identity': out.assertTarballIdentity = true; break;
      case '--assert-absent-or-identical': out.assertAbsentOrIdentical = true; break;
      case '--poll': out.pollAttempts = 10; break;
      case '--expect-dependency': {
        const raw = needValue();
        const eq = raw.indexOf('=');
        if (eq <= 0 || eq === raw.length - 1) {
          throw new Error(`--expect-dependency expects <name>=<exactVersion>, got "${raw}"`);
        }
        out.expectDependencies.push([raw.slice(0, eq), raw.slice(eq + 1)]);
        break;
      }
      default:
        // An unknown flag must never be read as a weaker mode.
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  for (const required of ['package', 'version']) {
    if (!out[required]) throw new Error(`--${required} is required`);
  }
  const modes = ['assertAbsent', 'assertTarballIdentity', 'assertAbsentOrIdentical'].filter((m) => out[m]);
  if (modes.length > 1) {
    throw new Error(`${modes.map((m) => '--' + m.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())).join(' and ')} are different modes; run them as separate invocations`);
  }
  if (out.assertAbsentOrIdentical) {
    if (!out.tarball) throw new Error('--tarball is required');
    const ignored = [];
    if (out.requireAttestations) ignored.push('--require-attestations');
    if (out.expectDependencies.length > 0) ignored.push('--expect-dependency');
    if (ignored.length > 0) {
      throw new Error(`--assert-absent-or-identical cannot be combined with ${ignored.join(', ')}`);
    }
  }
  if (out.assertAbsent) {
    // A flag that would be silently ignored is a flag that lies about what ran.
    const ignored = [];
    if (out.tarball) ignored.push('--tarball');
    if (out.requireAttestations) ignored.push('--require-attestations');
    if (out.expectDependencies.length > 0) ignored.push('--expect-dependency');
    if (ignored.length > 0) {
      throw new Error(`--assert-absent cannot be combined with ${ignored.join(', ')} (nothing is published yet to compare against)`);
    }
  } else if (out.assertAbsentOrIdentical) {
    // requirements already checked above
  } else if (out.assertTarballIdentity) {
    if (!out.tarball) throw new Error('--tarball is required');
    const ignored = [];
    if (out.requireAttestations) ignored.push('--require-attestations');
    if (out.expectDependencies.length > 0) ignored.push('--expect-dependency');
    if (ignored.length > 0) {
      throw new Error(`--assert-tarball-identity cannot be combined with ${ignored.join(', ')} (this mode never touches the registry)`);
    }
  } else if (!out.tarball) {
    throw new Error('--tarball is required');
  }
  return out;
}

/**
 * Publish a single-line boolean on `$GITHUB_OUTPUT` so the workflow can SKIP the
 * publish step on a resume instead of attempting a republish npm would reject.
 * Outside Actions this is a no-op.
 */
export function reportAlreadyPublished(value) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  appendFileSync(target, `already_published=${value ? 'true' : 'false'}\n`);
}

/**
 * Compare a published version against the local tarball byte-for-byte.
 * Returns `true` when they are identical (resume is safe), throws otherwise.
 */
export function assertPublishedBytesIdentical(entry, name, version, localIntegrity, servedBuf) {
  assertIntegrityMatchesLocal(entry, name, version, localIntegrity);
  assertServedTarballMatches(entry, name, version, servedBuf);
  return true;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    failClosed(err.message);
  }

  if (opts.assertTarballIdentity) {
    console.log(`[publish-readback] package : ${opts.package}@${opts.version}`);
    console.log(`[publish-readback] local   : ${opts.tarball}`);
    console.log('[publish-readback] mode    : ASSERT-TARBALL-IDENTITY (offline; npm publishes by manifest, not by filename)');
    console.log();
    try {
      const { manifest, layoutLine } = readTarballManifest(resolve(opts.tarball));
      console.log(layoutLine);
      console.log(assertManifestIdentity(manifest, opts.package, opts.version));
    } catch (err) {
      failClosed(err.message);
    }
    console.log(`\n[publish-readback] OK — the tarball really is ${opts.package}@${opts.version}.`);
    process.exit(0);
  }

  if (opts.assertAbsentOrIdentical) {
    console.log(`[publish-readback] package : ${opts.package}@${opts.version}`);
    console.log(`[publish-readback] registry: ${opts.registry}`);
    console.log(`[publish-readback] local   : ${opts.tarball}`);
    console.log('[publish-readback] mode    : ASSERT-ABSENT-OR-IDENTICAL (no-republish gate, resumable)');
    console.log();

    let localBuf;
    try {
      localBuf = readFileSync(resolve(opts.tarball));
    } catch (err) {
      failClosed(`cannot read local tarball ${opts.tarball}: ${err.message}`);
    }
    if (localBuf.length === 0) failClosed(`local tarball ${opts.tarball} is empty`);
    const localIntegrity = sha512Integrity(localBuf);
    console.log(`ok local tarball read (${localBuf.length} bytes) -> ${localIntegrity}`);

    let doc;
    try {
      doc = await fetchJson(`${opts.registry}/${encodeURIComponent(opts.package)}`);
    } catch (err) {
      failClosed(
        `cannot reach the registry document for ${opts.package}: ${err.message}. ` +
          'Refusing to treat an unanswered question as "not published".'
      );
    }
    try {
      assertPackumentShape(doc, opts.package);
    } catch (err) {
      failClosed(err.message);
    }

    if (!Object.keys(doc.versions).includes(opts.version)) {
      console.log(`ok ${opts.package}@${opts.version} is not on the registry — safe to publish`);
      reportAlreadyPublished(false);
      console.log(`\n[publish-readback] OK — nothing published yet for ${opts.package}@${opts.version}.`);
      process.exit(0);
    }

    // Present. The ONLY safe reason to continue is that these exact bytes are
    // already the published bytes — i.e. this same release got as far as
    // publishing and then failed later. Anything else is a republish attempt.
    const entry = doc.versions[opts.version];
    const tarballUrl = entry?.dist?.tarball;
    if (!tarballUrl) failClosed(`${opts.package}@${opts.version}: registry manifest has no dist.tarball`);
    let servedBuf;
    try {
      servedBuf = await fetchBuffer(tarballUrl);
    } catch (err) {
      failClosed(`downloading ${tarballUrl} failed: ${err.message}`);
    }
    try {
      assertPublishedBytesIdentical(entry, opts.package, opts.version, localIntegrity, servedBuf);
    } catch (err) {
      failClosed(
        `${err.message} — ${opts.package}@${opts.version} is already published with DIFFERENT bytes. ` +
          'Published versions are immutable; bump the version.'
      );
    }
    console.log(`ok ${opts.package}@${opts.version} already published, identical bytes — resuming`);
    reportAlreadyPublished(true);
    console.log(`\n[publish-readback] OK — this exact release is already on the registry; skip the publish step.`);
    process.exit(0);
  }

  if (opts.assertAbsent) {
    console.log(`[publish-readback] package : ${opts.package}@${opts.version}`);
    console.log(`[publish-readback] registry: ${opts.registry}`);
    console.log('[publish-readback] mode    : ASSERT-ABSENT (pre-publish no-republish gate)');
    console.log();

    let absenceDoc;
    try {
      absenceDoc = await fetchJson(`${opts.registry}/${encodeURIComponent(opts.package)}`);
    } catch (err) {
      // Including a package-level 404: for a package that is known to exist, an
      // absent manifest means the registry is not answering, not that the
      // version is free.
      failClosed(
        `cannot reach the registry document for ${opts.package}: ${err.message}. ` +
          'Refusing to treat an unanswered question as "not published".'
      );
    }
    try {
      console.log(assertVersionAbsent(absenceDoc, opts.package, opts.version));
    } catch (err) {
      failClosed(err.message);
    }
    console.log(`\n[publish-readback] OK — ${opts.package}@${opts.version} is safe to publish.`);
    process.exit(0);
  }

  console.log(`[publish-readback] package : ${opts.package}@${opts.version}`);
  console.log(`[publish-readback] registry: ${opts.registry}`);
  console.log(`[publish-readback] local   : ${opts.tarball}`);
  console.log(
    `[publish-readback] mode    : attestations=${opts.requireAttestations ? 'REQUIRED' : 'not required'}` +
      `, exact-deps=${opts.expectDependencies.length}`
  );
  console.log();

  let localBuf;
  try {
    localBuf = readFileSync(resolve(opts.tarball));
  } catch (err) {
    failClosed(`cannot read local tarball ${opts.tarball}: ${err.message}`);
  }
  if (localBuf.length === 0) failClosed(`local tarball ${opts.tarball} is empty`);
  const localIntegrity = sha512Integrity(localBuf);
  console.log(`ok local tarball read (${localBuf.length} bytes) -> ${localIntegrity}`);

  // A publish that just succeeded is not instantly visible on every edge, and
  // provenance attestations are attached asynchronously. With --poll the whole
  // assertion set is retried on a bounded schedule so a release does not fail on
  // propagation lag; without it (the default, used by the tests) it runs once.
  const runAssertions = async () => {
    const lines = [];
    const doc = await fetchJson(`${opts.registry}/${encodeURIComponent(opts.package)}`);
    lines.push(assertVersionPresent(doc, opts.package, opts.version));
    const entry = doc.versions[opts.version];
    lines.push(assertIntegrityMatchesLocal(entry, opts.package, opts.version, localIntegrity));
    const tarballUrl = entry?.dist?.tarball;
    if (!tarballUrl) throw new Error(`${opts.package}@${opts.version}: registry manifest has no dist.tarball`);
    const servedBuf = await fetchBuffer(tarballUrl);
    lines.push(assertServedTarballMatches(entry, opts.package, opts.version, servedBuf));
    lines.push(assertLatestTag(doc, opts.package, opts.version));
    if (opts.requireAttestations) {
      lines.push(assertAttestations(entry, opts.package, opts.version));
    }
    lines.push(...assertExactDependencies(entry, opts.package, opts.version, opts.expectDependencies));
    return lines;
  };

  let lines;
  let lastError;
  for (let attempt = 1; attempt <= opts.pollAttempts; attempt++) {
    try {
      lines = await runAssertions();
      if (attempt > 1) console.log(`(satisfied on attempt ${attempt}/${opts.pollAttempts})`);
      break;
    } catch (err) {
      lastError = err;
      if (attempt === opts.pollAttempts) break;
      console.log(`waiting for the registry to converge (attempt ${attempt}/${opts.pollAttempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
  if (!lines) failClosed(lastError?.message ?? 'readback failed for an unrecorded reason');
  for (const line of lines) console.log(line);

  console.log(`\n[publish-readback] OK — the registry serves exactly the published bytes of ${opts.package}@${opts.version}.`);
  process.exit(0);
}

// Only run the CLI when executed directly; importing this file for tests must
// never hit the network or exit the test process.
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err) => failClosed(err?.stack ?? String(err)));
}
