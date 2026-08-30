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
 * The pinned package set is checked against the packages this repo actually
 * publishes, discovered from the filesystem the same way the detector discovers
 * them. A pin is only evidence about packages the gate goes on to compare, so a
 * pin naming something else — or omitting one of ours — is not weaker evidence,
 * it is evidence about a different question. Consequence worth knowing: adding a
 * new publishable package makes every existing pin fail closed until a pin
 * covering it is verified. That is the intended direction — you cannot inherit a
 * reproducibility claim for a package nobody has ever checked.
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

import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

// Not `import.meta.dirname`: that is Node >= 20.11, while this repo's engines field
// allows 18. On 18 it is undefined, so the module threw a TypeError at import time and
// the process exited 1 — an unreadable failure instead of this file's fail-closed 3.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_PINS = join(REPO_ROOT, 'scripts', 'publish-pins.json');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

const COMMIT_RE = /^[0-9a-f]{40}$/;
// Strict MAJOR.MINOR.PATCH. No prerelease, no build metadata, no leading zeros:
// "1.2.0-rc.1" as the authority for "published bytes reproduce" would be wrong
// on its face, and "01.2.0" is not the string npm published.
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Scoped-name split, verbatim from validate-npm-package-name.
const SCOPED_PACKAGE_RE = /^(?:@([^/]+?)\/)?([^/]+?)$/;
const NAME_EXCLUSION_LIST = new Set(['node_modules', 'favicon.ico']);
const MAX_PACKAGE_NAME_LENGTH = 214;
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

/**
 * npm's real package-name rules, ported from validate-npm-package-name's
 * `validForNewPackages` (errors AND legacy warnings both disqualify): no leading
 * `.`/`-`/`_`, no surrounding whitespace, not `node_modules`/`favicon.ico`, <= 214
 * chars, no capitals, none of `~'!()*`, and URL-clean — with the scoped escape
 * hatch where `@scope/name` is fine if each part is URL-clean on its own. A
 * hand-rolled character class got this wrong in both directions: it accepted
 * `-pkg`, `~pkg`, `node_modules` and `favicon.ico`, and rejected the perfectly
 * valid `@scope/_pkg` and `@_scope/pkg`.
 *
 * SCOPE (stated): the validator's "is a core module name" warning is not ported —
 * that would mean vendoring Node's builtin list for no gain here, since the
 * package-set check already constrains names to the ones this repo publishes.
 *
 * Beyond correctness this is a security boundary: package names reach
 * `$GITHUB_OUTPUT`, and a name containing a newline could append a second
 * `commit=<sha>` line that the runner's parser would accept as the winning
 * assignment — steering the pinned checkout to an arbitrary commit.
 *
 * @returns {string|null} the reason it is invalid, or null when valid
 */
export function npmPackageNameError(name) {
  if (typeof name !== 'string') return 'must be a string';
  if (name.length === 0) return 'length must be greater than zero';
  if (name.startsWith('.')) return 'cannot start with a period';
  if (name.startsWith('-')) return 'cannot start with a hyphen';
  if (name.startsWith('_')) return 'cannot start with an underscore';
  if (name.trim() !== name) return 'cannot contain leading or trailing spaces';
  if (NAME_EXCLUSION_LIST.has(name.toLowerCase())) return `${name.toLowerCase()} is not a valid package name`;
  if (name.length > MAX_PACKAGE_NAME_LENGTH) return `cannot contain more than ${MAX_PACKAGE_NAME_LENGTH} characters`;
  if (name.toLowerCase() !== name) return 'cannot contain capital letters';
  if (/[~'!()*]/.test(name.split('/').slice(-1)[0])) return 'cannot contain special characters ("~\'!()*")';
  if (encodeURIComponent(name) !== name) {
    const match = name.match(SCOPED_PACKAGE_RE);
    if (match) {
      const [, scope, pkg] = match;
      if (pkg.startsWith('.')) return 'cannot start with a period';
      if (scope !== undefined && encodeURIComponent(scope) === scope && encodeURIComponent(pkg) === pkg) return null;
    }
    return 'can only contain URL-friendly characters';
  }
  return null;
}

/**
 * Numeric semver compare over BigInt components.
 *
 * Not Number: `Number('9007199254740993') === Number('9007199254740992')` is
 * true past 2^53, which would collapse two distinct versions into a tie and let
 * a pair of crossing pins resolve to a "maximum" that is not one.
 */
function compareVersions(a, b) {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < 3; i += 1) {
    const na = BigInt(pa[i]);
    const nb = BigInt(pb[i]);
    if (na !== nb) return na < nb ? -1 : 1;
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

/**
 * Discover the packages this repo publishes, from the filesystem rather than a
 * hardcoded list, by the same rule as `scripts/check-publish-drift.mjs#discoverPackages`
 * (every non-private package manifest one level under `packages/`).
 *
 * Note the two run against different trees: this resolver reads the current
 * checkout, while the detector reads the pinned tree it rebuilds. That is why a
 * divergence fails closed rather than being reconciled — the resolver cannot see
 * the pinned tree yet, and a pin covering a different package set is evidence
 * about a different question.
 *
 * @returns {string[]} sorted package names
 */
export function readPublishableManifests(packagesDir = PACKAGES_DIR) {
  let dirs;
  try {
    dirs = readdirSync(packagesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch (err) {
    reject(`cannot read ${packagesDir}: ${err.message}`);
  }
  const manifests = [];
  for (const d of dirs) {
    const manifestPath = join(packagesDir, d.name, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    if (manifest.private === true) continue;
    if (!manifest.name || !manifest.version) {
      reject(`${manifestPath} is publishable but has no name/version`);
    }
    manifests.push({ name: manifest.name, version: manifest.version });
  }
  if (manifests.length === 0) reject(`discovered zero publishable packages under ${packagesDir}`);
  return manifests.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** @returns {string[]} sorted names of the packages this repo publishes */
export function discoverPublishablePackages(packagesDir = PACKAGES_DIR) {
  return readPublishableManifests(packagesDir).map((m) => m.name);
}

/**
 * Bind the selected pin to the tree that was actually checked out.
 *
 * Without this, the versions in publish-pins.json are decorative. A pin could
 * claim commit 42f06cf is `999.0.0`, win selection on that number, and send the
 * workflow to check out a tree whose manifests really say 1.2.0 — the rebuild
 * would then re-prove 1.2.0 against npm, pass `--expect-in-sync`, and report
 * that reproducibility holds while the release the pin named was never touched.
 * The claim and the evidence have to be the same release.
 *
 * @param {object} pin the selected pin
 * @param {string} treeDir root of the checked-out pinned tree
 */
export function assertTreeMatchesPin(pin, treeDir) {
  const manifests = readPublishableManifests(join(treeDir, 'packages'));
  const tree = new Map(manifests.map((m) => [m.name, m.version]));

  const pinNames = Object.keys(pin.packages).sort();
  const treeNames = [...tree.keys()].sort();
  if (pinNames.length !== treeNames.length || pinNames.some((n, i) => n !== treeNames[i])) {
    reject(
      `pinned tree ${treeDir} publishes [${treeNames.join(', ')}] but pin ${pin.commit} covers ` +
        `[${pinNames.join(', ')}] — the pin does not describe this tree`,
    );
  }

  const mismatches = pinNames
    .filter((name) => tree.get(name) !== pin.packages[name])
    .map((name) => `${name}: pin says ${pin.packages[name]}, tree says ${tree.get(name)}`);
  if (mismatches.length > 0) {
    reject(`pinned tree ${treeDir} is not the release the pin claims (${pin.commit}) — ${mismatches.join('; ')}`);
  }
}

function validateVerifiedPin(pin, index, expectedPackages) {
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
    const nameError = npmPackageNameError(name);
    if (nameError) {
      reject(`${at} (${pin.commit}): ${JSON.stringify(name)} is not a valid npm package name — ${nameError}`);
    }
    const version = pin.packages[name];
    if (typeof version !== 'string') {
      reject(`${at} (${pin.commit}): version for ${name} must be a string (got ${JSON.stringify(version)})`);
    }
    if (!SEMVER_RE.test(version)) {
      reject(`${at} (${pin.commit}): version for ${name} must be strict MAJOR.MINOR.PATCH (got ${JSON.stringify(version)})`);
    }
  }

  // Absolute, not relative to a sibling pin: a pin is evidence only about the
  // packages the detector goes on to compare.
  const sorted = [...names].sort();
  if (sorted.length !== expectedPackages.length || sorted.some((n, i) => n !== expectedPackages[i])) {
    reject(
      `${at} (${pin.commit}): pins [${sorted.join(', ')}] but this repo publishes [${expectedPackages.join(', ')}] — ` +
        'a verified pin must cover exactly the packages the drift gate compares',
    );
  }
}

/**
 * Select the canonical pin: the newest VERIFIED release, by version dominance
 * across every pinned package. Pure — throws PinResolutionError, never exits.
 *
 * @param {unknown} doc parsed publish-pins.json
 * @param {{expectedPackages: string[]}} options the repo's publishable package
 *   names. Required: defaulting it would make the package-set check skippable,
 *   which is the weaker mode this resolver refuses to have.
 * @returns {{pin: object, verifiedCount: number, pendingCount: number}}
 */
export function selectCanonicalPin(doc, options = {}) {
  const { expectedPackages } = options;
  if (!Array.isArray(expectedPackages) || expectedPackages.length === 0 || expectedPackages.some((n) => typeof n !== 'string')) {
    reject('expectedPackages must be a non-empty array of package names — refusing to select without knowing what this repo publishes');
  }
  const expected = [...expectedPackages].sort();

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
    validateVerifiedPin(pin, index, expected);
    verified.push({ pin, index });
  });

  if (verified.length === 0) {
    reject(`no pin has status "verified" (${doc.pins.length} pin(s), ${pendingCount} pending) — nothing is proven reproducible`);
  }

  // One deterministic commit produces one set of version strings. Two verified
  // pins on the same commit is contradictory evidence, not a tie to break.
  const byCommit = new Map();
  for (const { pin, index } of verified) {
    if (byCommit.has(pin.commit)) {
      reject(`verified pins[${byCommit.get(pin.commit)}] and pins[${index}] share commit ${pin.commit} — one commit cannot have produced two releases`);
    }
    byCommit.set(pin.commit, index);
  }

  // Two verified pins claiming the same version of the same package means the
  // evidence base contradicts itself: one commit produced those bytes, not two.
  for (const name of expected) {
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
    verified.every(({ pin: other }) => expected.every((name) => compareVersions(pin.packages[name], other.packages[name]) >= 0)),
  );

  if (dominators.length !== 1) {
    const described = verified
      .map(({ pin, index }) => `pins[${index}]=${expected.map((n) => `${n}@${pin.packages[n]}`).join('+')}`)
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
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    reject(`cannot parse ${path} as JSON: ${err.message}`);
  }

  // Canonical form, or nothing. JSON.parse silently keeps the LAST of duplicate
  // keys, so `{"@frihet/sdk":"1.0.0","@frihet/sdk":"3.0.0"}` parsed to 3.0.0 and
  // swapping the two literals changed the resolved release — positional authority
  // sneaking back in through a channel the schema checks never see. Re-serializing
  // collapses duplicates, so a file containing any cannot match its own canonical
  // form. It freezes indentation and trailing newline as a side effect.
  const canonical = `${JSON.stringify(doc, null, 2)}\n`;
  if (raw !== canonical) {
    reject(
      `${path} is not in canonical JSON form (2-space indent, trailing newline, no duplicate keys). ` +
        'Rewrite it with: node -e "const f=process.argv[1],fs=require(\'fs\');' +
        'fs.writeFileSync(f,JSON.stringify(JSON.parse(fs.readFileSync(f,\'utf8\')),null,2)+String.fromCharCode(10))" ' +
        `${path}`,
    );
  }
  return doc;
}

function failClosed(reason) {
  console.error(`\n[release-pin] FAIL-CLOSED: ${reason}`);
  console.error('[release-pin] No canonical release pin could be selected. Refusing to pick one anyway.');
  process.exit(3);
}

/**
 * Belt and braces over the package-name grammar: nothing with a line break ever
 * reaches `$GITHUB_OUTPUT`, where a second line would be parsed as a further
 * `key=value` assignment and could override the commit the workflow checks out.
 * Exported so the guard is tested directly rather than only through inputs the
 * name grammar already rejects.
 */
export function assertSingleLine(key, value) {
  if (/[\n\r]/.test(value)) {
    reject(`refusing to write a multi-line value for GITHUB_OUTPUT key "${key}": ${JSON.stringify(value)}`);
  }
}

function parseArgs(argv) {
  const options = { pinsPath: DEFAULT_PINS, githubOutput: false, assertTree: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--github-output') {
      options.githubOutput = true;
    } else if (arg === '--pins' || arg === '--assert-tree') {
      const value = argv[i + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
        failClosed(`${arg} requires a ${arg === '--pins' ? 'file' : 'directory'} path`);
      }
      if (arg === '--pins') options.pinsPath = resolve(value);
      else options.assertTree = resolve(value);
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
  let expectedPackages;
  try {
    expectedPackages = discoverPublishablePackages();
    selection = selectCanonicalPin(loadPinsDocument(options.pinsPath), { expectedPackages });
    // Selection first, then bind it to the tree: asserting against a tree we did
    // not justify selecting would prove the wrong thing.
    if (options.assertTree) assertTreeMatchesPin(selection.pin, options.assertTree);
  } catch (err) {
    failClosed(err instanceof PinResolutionError ? err.message : (err?.stack ?? String(err)));
  }

  const { pin, verifiedCount, pendingCount } = selection;
  const versions = expectedPackages.map((name) => `${name}@${pin.packages[name]}`);

  console.error(
    `[release-pin] selected ${versions.join(' + ')} → ${pin.commit.slice(0, 7)}… ` +
      `(latest verified of ${verifiedCount} verified, ${pendingCount} pending ignored)`,
  );

  if (options.assertTree) {
    console.error(`[release-pin] pinned tree ${options.assertTree} matches the pin: ${versions.join(' + ')}`);
  }

  if (options.githubOutput) {
    const target = process.env.GITHUB_OUTPUT;
    if (!target) {
      failClosed('--github-output was requested but GITHUB_OUTPUT is not set — refusing to drop the resolved commit silently');
    }
    const outputs = { commit: pin.commit, versions: versions.join(',') };
    try {
      for (const [key, value] of Object.entries(outputs)) assertSingleLine(key, value);
      appendFileSync(target, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(''));
    } catch (err) {
      failClosed(err instanceof PinResolutionError ? err.message : `cannot append to GITHUB_OUTPUT (${target}): ${err.message}`);
    }
  }

  console.log(JSON.stringify({ commit: pin.commit, packages: pin.packages, verifiedAt: pin.verifiedAt }));
  process.exit(0);
}

// Importing this module (tests) must not run the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
