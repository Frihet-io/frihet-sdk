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
 * TARBALL BYTES for one version of one package. It does not verify the contents
 * of the tarball (that is `check-publish-drift.mjs`, which rebuilds dist/** from
 * source), and it does not cryptographically verify the provenance attestation —
 * `--require-attestations` asserts only that the registry records an attestation
 * for this version, which is what a caller can observe from outside npm.
 *
 * Assertions, all of which must pass for exit 0:
 *   1. the version exists in the registry document
 *   2. `dist.integrity` is sha512 and equals the sha512 of the LOCAL tarball
 *   3. the tarball the registry serves downloads and re-hashes to that same sha512
 *   4. `dist-tags.latest` === this version
 *   5. `dist.attestations` is present            (only with --require-attestations)
 *   6. each --expect-dependency matches EXACTLY  (no range, no `workspace:`)
 *
 * Exit codes:
 *   0  every assertion passed
 *   3  fail-closed — any assertion failed, any network/parse error, any unknown
 *      argument. There is no other non-zero exit: a readback that cannot be
 *      completed is indistinguishable from a readback that failed.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  for (const required of ['package', 'version', 'tarball']) {
    if (!out[required]) throw new Error(`--${required} is required`);
  }
  return out;
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

  let doc;
  try {
    doc = await fetchJson(`${opts.registry}/${encodeURIComponent(opts.package)}`);
  } catch (err) {
    failClosed(`registry lookup for ${opts.package} failed: ${err.message}`);
  }

  try {
    console.log(assertVersionPresent(doc, opts.package, opts.version));
  } catch (err) {
    failClosed(err.message);
  }

  const entry = doc.versions[opts.version];

  try {
    console.log(assertIntegrityMatchesLocal(entry, opts.package, opts.version, localIntegrity));
  } catch (err) {
    failClosed(err.message);
  }

  const tarballUrl = entry?.dist?.tarball;
  if (!tarballUrl) failClosed(`${opts.package}@${opts.version}: registry manifest has no dist.tarball`);
  let servedBuf;
  try {
    servedBuf = await fetchBuffer(tarballUrl);
  } catch (err) {
    failClosed(`downloading ${tarballUrl} failed: ${err.message}`);
  }

  try {
    console.log(assertServedTarballMatches(entry, opts.package, opts.version, servedBuf));
    console.log(assertLatestTag(doc, opts.package, opts.version));
    if (opts.requireAttestations) {
      console.log(assertAttestations(entry, opts.package, opts.version));
    }
    for (const line of assertExactDependencies(entry, opts.package, opts.version, opts.expectDependencies)) {
      console.log(line);
    }
  } catch (err) {
    failClosed(err.message);
  }

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
