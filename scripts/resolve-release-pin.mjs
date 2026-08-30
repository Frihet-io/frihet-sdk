#!/usr/bin/env node
/**
 * Canonical release-pin resolver — decides WHICH published release the
 * reproducibility gate re-proves, semantically rather than positionally.
 *
 * Why this exists: `.github/workflows/publish-drift.yml` used to read
 * `.pins[0].commit`. Array position is accidental authority — reordering the
 * JSON, or appending a pin for a release that has not been byte-verified yet,
 * silently changes what "reproducibility holds" means without any diff to the
 * gate. When 1.3.0 shipped, `pins[0]` still pointed at 1.2.0, so the gate was
 * re-proving a superseded release and nobody could see it.
 *
 * The rule instead: among pins explicitly marked `"status": "verified"`, select
 * the one that is greater-or-equal on EVERY package version than every other
 * verified pin (a total maximum). `pending` pins are inert — a pin added for an
 * unverified release can never become the authority, and can never break the
 * selection either. Order in the file carries no meaning; the tests prove it by
 * resolving the same document reversed.
 *
 * SCOPE (stated, not implied): this resolver decides WHICH commit to rebuild.
 * It does not verify reproducibility — that is `scripts/check-publish-drift.mjs`
 * run with `--expect-in-sync` against the resolved commit. A green here means
 * "the newest verified pin is unambiguous", nothing about bytes.
 *
 * Validation is strict on verified pins only, because only a verified pin can be
 * selected. A malformed `pending` entry is ignored while it is pending and fails
 * closed the moment someone flips it to `verified` — the safe direction. `status`
 * itself is validated on every pin: an entry with no/unknown status is not a pin
 * this resolver understands, and guessing would be the phantom mechanism this
 * whole file exists to remove.
 *
 * Exit codes:
 *   0  a single canonical verified pin was selected
 *   3  fail-closed — no justified selection. Never silently picks something.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_PINS = join(REPO_ROOT, 'scripts', 'publish-pins.json');

const COMMIT_RE = /^[0-9a-f]{40}$/;
// Strict MAJOR.MINOR.PATCH. No prerelease, no build metadata, no leading zeros:
// "1.2.0-rc.1" as the authority for "published bytes reproduce" would be wrong
// on its face, and "01.2.0" is not the string npm published.
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KNOWN_STATUSES = new Set(['verified', 'pending']);

/** Thrown for every rejected document so the CLI can map it to exit 3. */
class PinResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PinResolutionError';
  }
}

function reject(reason) {
  throw new PinResolutionError(reason);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Numeric semver compare (1.10.0 > 1.9.0 — lexicographic would get this wrong). */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** A real calendar date, not merely four-two-two digits ("2026-13-45" is not one). */
function isRealIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validateVerifiedPin(pin, index) {
  const at = `pins[${index}]`;

  if (typeof pin.commit !== 'string' || !COMMIT_RE.test(pin.commit)) {
    reject(`${at}: commit must be exactly 40 lowercase hex characters (got ${JSON.stringify(pin.commit)})`);
  }
  if (!isRealIsoDate(pin.verifiedAt)) {
    reject(`${at} (${pin.commit}): status "verified" requires verifiedAt as a real YYYY-MM-DD date (got ${JSON.stringify(pin.verifiedAt)})`);
  }
  if (!isPlainObject(pin.packages)) {
    reject(`${at} (${pin.commit}): packages must be an object of name -> version`);
  }
  const names = Object.keys(pin.packages);
  if (names.length === 0) {
    reject(`${at} (${pin.commit}): packages is empty — a pin that pins nothing cannot be authority`);
  }
  for (const name of names) {
    if (name.length === 0) reject(`${at} (${pin.commit}): packages has an empty package name`);
    const version = pin.packages[name];
    if (typeof version !== 'string') {
      reject(`${at} (${pin.commit}): version for ${name} must be a string (got ${JSON.stringify(version)})`);
    }
    if (!SEMVER_RE.test(version)) {
      reject(`${at} (${pin.commit}): version for ${name} must be strict MAJOR.MINOR.PATCH (got ${JSON.stringify(version)})`);
    }
  }
}

/**
 * Select the canonical pin: the newest VERIFIED release, by version dominance
 * across every pinned package. Pure — throws PinResolutionError, never exits.
 *
 * @param {unknown} doc parsed publish-pins.json
 * @returns {{pin: object, verifiedCount: number, pendingCount: number}}
 */
export function selectCanonicalPin(doc) {
  if (!isPlainObject(doc)) reject('publish-pins document must be a JSON object');
  if (!Array.isArray(doc.pins)) reject('publish-pins.pins must be an array');
  if (doc.pins.length === 0) reject('publish-pins.pins is empty — there is no release to re-prove');

  const verified = [];
  let pendingCount = 0;

  doc.pins.forEach((pin, index) => {
    if (!isPlainObject(pin)) reject(`pins[${index}] must be an object`);
    if (typeof pin.status !== 'string' || !KNOWN_STATUSES.has(pin.status)) {
      reject(
        `pins[${index}]: status must be exactly "verified" or "pending" (got ${JSON.stringify(pin.status)}) — ` +
          'an entry whose status this resolver does not understand is never guessed at',
      );
    }
    if (pin.status === 'pending') {
      pendingCount += 1;
      return;
    }
    validateVerifiedPin(pin, index);
    verified.push({ pin, index });
  });

  if (verified.length === 0) {
    reject(`no pin has status "verified" (${doc.pins.length} pin(s), ${pendingCount} pending) — nothing is proven reproducible`);
  }

  // Every verified pin must cover the same package set. Otherwise a pin that
  // silently dropped a package could "dominate" on the packages it kept.
  const reference = verified[0];
  const referenceNames = Object.keys(reference.pin.packages).sort();
  for (const { pin, index } of verified.slice(1)) {
    const names = Object.keys(pin.packages).sort();
    if (names.length !== referenceNames.length || names.some((n, i) => n !== referenceNames[i])) {
      reject(
        `verified pins disagree on which packages they pin: pins[${reference.index}] has [${referenceNames.join(', ')}] ` +
          `but pins[${index}] has [${names.join(', ')}]`,
      );
    }
  }

  // Two verified pins claiming the same version of the same package means the
  // evidence base contradicts itself: one commit produced those bytes, not two.
  for (const name of referenceNames) {
    const seen = new Map();
    for (const { pin, index } of verified) {
      const version = pin.packages[name];
      if (seen.has(version)) {
        reject(`verified pins[${seen.get(version)}] and pins[${index}] both claim ${name}@${version} — duplicate version, ambiguous authority`);
      }
      seen.set(version, index);
    }
  }

  // Total maximum: dominates every other verified pin on every package.
  const dominators = verified.filter(({ pin }) =>
    verified.every(({ pin: other }) => referenceNames.every((name) => compareVersions(pin.packages[name], other.packages[name]) >= 0)),
  );

  if (dominators.length !== 1) {
    const described = verified
      .map(({ pin, index }) => `pins[${index}]=${referenceNames.map((n) => `${n}@${pin.packages[n]}`).join('+')}`)
      .join(', ');
    reject(`no single newest verified pin: versions cross between pins, so "latest" is undefined (${described})`);
  }

  return { pin: dominators[0].pin, verifiedCount: verified.length, pendingCount };
}

/** Read + parse the pins file. Unreadable or non-JSON is fail-closed, never empty. */
export function loadPinsDocument(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    reject(`cannot read ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    reject(`cannot parse ${path} as JSON: ${err.message}`);
  }
}

function failClosed(reason) {
  console.error(`\n[release-pin] FAIL-CLOSED: ${reason}`);
  console.error('[release-pin] No canonical release pin could be selected. Refusing to pick one anyway.');
  process.exit(3);
}

function parseArgs(argv) {
  const options = { pinsPath: DEFAULT_PINS, githubOutput: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--github-output') {
      options.githubOutput = true;
    } else if (arg === '--pins') {
      const value = argv[i + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
        failClosed('--pins requires a file path');
      }
      options.pinsPath = resolve(value);
      i += 1;
    } else {
      // An unknown flag must never be read as a weaker mode.
      failClosed(`unknown argument(s): ${arg}`);
    }
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);

  let selection;
  try {
    selection = selectCanonicalPin(loadPinsDocument(options.pinsPath));
  } catch (err) {
    failClosed(err instanceof PinResolutionError ? err.message : (err?.stack ?? String(err)));
  }

  const { pin, verifiedCount, pendingCount } = selection;
  const versions = Object.keys(pin.packages)
    .sort()
    .map((name) => `${name}@${pin.packages[name]}`);

  console.error(
    `[release-pin] selected ${versions.join(' + ')} → ${pin.commit.slice(0, 7)}… ` +
      `(latest verified of ${verifiedCount} verified, ${pendingCount} pending ignored)`,
  );

  if (options.githubOutput) {
    const target = process.env.GITHUB_OUTPUT;
    if (!target) {
      failClosed('--github-output was requested but GITHUB_OUTPUT is not set — refusing to drop the resolved commit silently');
    }
    try {
      appendFileSync(target, `commit=${pin.commit}\nversions=${versions.join(',')}\n`);
    } catch (err) {
      failClosed(`cannot append to GITHUB_OUTPUT (${target}): ${err.message}`);
    }
  }

  console.log(JSON.stringify({ commit: pin.commit, packages: pin.packages, verifiedAt: pin.verifiedAt }));
  process.exit(0);
}

// Importing this module (tests) must not run the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
