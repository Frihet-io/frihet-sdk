/**
 * Tests for the canonical release-pin resolver.
 *
 * Two surfaces are exercised deliberately: the pure `selectCanonicalPin` (what
 * gets selected and why) and the CLI (exit codes and outputs, which is what the
 * workflow actually consumes — a pure function that throws is worthless if the
 * CLI exits 0 anyway).
 *
 * The pinning test for the real bug is `resolves the repo's real publish-pins.json`:
 * `pins[0]` is 1.2.0 while the verified release is 1.3.0, so any regression back to
 * positional selection turns that test red.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertSingleLine,
  assertTreeMatchesPin,
  discoverPublishablePackages,
  npmPackageNameError,
  readPublishableManifests,
  selectCanonicalPin,
} from '../resolve-release-pin.mjs';

const SCRIPTS_DIR = fileURLToPath(new URL('..', import.meta.url));
const RESOLVER = join(SCRIPTS_DIR, 'resolve-release-pin.mjs');
const REAL_PINS = join(SCRIPTS_DIR, 'publish-pins.json');
const REPO_ROOT = join(SCRIPTS_DIR, '..');

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'release-pin-test-'));
  tempDirs.push(dir);
  return dir;
}

/** Write a pins document (or raw string) to a temp file and return its path. */
function writePins(content) {
  const file = join(tempDir(), 'publish-pins.json');
  // Canonical form (2-space indent + trailing newline) — loadPinsDocument requires it.
  writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  return file;
}

/**
 * Run the CLI without throwing, so exit codes can be asserted directly.
 *
 * stderr goes to a real file descriptor rather than a pipe: execFileSync only
 * hands back stderr on the error path, so a piped stderr would read as empty on
 * every successful run — and every assertion about the human line would pass
 * vacuously against ''.
 */
function runCli(args = [], env = {}) {
  const errFile = join(tempDir(), 'stderr.log');
  const fd = openSync(errFile, 'w');
  try {
    const stdout = execFileSync(process.execPath, [RESOLVER, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', fd],
      env: { ...process.env, GITHUB_OUTPUT: '', ...env },
    });
    return { status: 0, stdout, stderr: readFileSync(errFile, 'utf8') };
  } catch (err) {
    return { status: err.status, stdout: err.stdout ?? '', stderr: readFileSync(errFile, 'utf8') };
  } finally {
    closeSync(fd);
  }
}

/**
 * The packages this repo actually publishes. selectCanonicalPin requires them —
 * there is no default, so the package-set check cannot be skipped by omission.
 */
const EXPECTED_PACKAGES = ['@frihet/sdk', 'frihet'];
const select = (doc, expectedPackages = EXPECTED_PACKAGES) => selectCanonicalPin(doc, { expectedPackages });

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);
const COMMIT_C = 'c'.repeat(40);

function pin(commit, sdk, cli, extra = {}) {
  return {
    commit,
    status: 'verified',
    verifiedAt: '2026-08-30',
    packages: { '@frihet/sdk': sdk, frihet: cli },
    ...extra,
  };
}

describe('selectCanonicalPin — selection', () => {
  it('selects the newest verified pin among several', () => {
    const doc = { pins: [pin(COMMIT_A, '1.2.0', '1.2.0'), pin(COMMIT_B, '1.3.0', '1.3.0')] };
    const { pin: selected, verifiedCount, pendingCount } = select(doc);
    assert.equal(selected.commit, COMMIT_B);
    assert.equal(verifiedCount, 2);
    assert.equal(pendingCount, 0);
  });

  it('selects the newest even when it is NOT pins[0] (the accidental-authority bug)', () => {
    const doc = { pins: [pin(COMMIT_B, '1.3.0', '1.3.0'), pin(COMMIT_A, '1.2.0', '1.2.0')] };
    assert.equal(select(doc).pin.commit, COMMIT_B);

    const reordered = { pins: [pin(COMMIT_A, '1.2.0', '1.2.0'), pin(COMMIT_B, '1.3.0', '1.3.0')] };
    assert.equal(select(reordered).pin.commit, COMMIT_B);
  });

  it('is order-independent across every permutation of three verified pins', () => {
    const pins = [pin(COMMIT_A, '1.1.0', '1.1.0'), pin(COMMIT_B, '1.2.0', '1.2.0'), pin(COMMIT_C, '1.3.0', '1.3.0')];
    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    for (const order of permutations) {
      const doc = { pins: order.map((i) => pins[i]) };
      assert.equal(select(doc).pin.commit, COMMIT_C, `order ${order.join('')}`);
    }
  });

  it('compares versions numerically, not lexicographically (1.10.0 > 1.9.0)', () => {
    const doc = { pins: [pin(COMMIT_A, '1.10.0', '1.10.0'), pin(COMMIT_B, '1.9.0', '1.9.0')] };
    assert.equal(select(doc).pin.commit, COMMIT_A);
  });

  it('compares patch numerically too (2.0.10 > 2.0.9)', () => {
    const doc = { pins: [pin(COMMIT_A, '2.0.9', '2.0.9'), pin(COMMIT_B, '2.0.10', '2.0.10')] };
    assert.equal(select(doc).pin.commit, COMMIT_B);
  });

  it('accepts a single verified pin', () => {
    const doc = { pins: [pin(COMMIT_A, '1.2.0', '1.2.0')] };
    assert.equal(select(doc).pin.commit, COMMIT_A);
  });

  it('ignores a pending pin with a HIGHER version — it cannot hijack the selection', () => {
    const doc = {
      pins: [
        pin(COMMIT_A, '1.2.0', '1.2.0'),
        pin(COMMIT_B, '1.3.0', '1.3.0'),
        { commit: COMMIT_C, status: 'pending', packages: { '@frihet/sdk': '1.4.0', frihet: '1.4.0' } },
      ],
    };
    const { pin: selected, verifiedCount, pendingCount } = select(doc);
    assert.equal(selected.commit, COMMIT_B);
    assert.equal(verifiedCount, 2);
    assert.equal(pendingCount, 1);
  });

  it('still selects a pin that dominates everything, even if two older pins cross each other', () => {
    // A is >= every other pin on every package, so "latest" is defined even though
    // B and C are mutually incomparable. The rule is a total maximum, not a sort.
    const doc = {
      pins: [pin(COMMIT_B, '1.2.0', '1.1.0'), pin(COMMIT_C, '1.1.0', '1.2.0'), pin(COMMIT_A, '1.3.0', '1.3.0')],
    };
    assert.equal(select(doc).pin.commit, COMMIT_A);
  });

  it('ignores a pending pin even when it is malformed — pending must never break selection', () => {
    const doc = {
      pins: [
        pin(COMMIT_B, '1.3.0', '1.3.0'),
        { commit: 'NOT-A-SHA', status: 'pending', packages: { '@frihet/sdk': 'nonsense' } },
      ],
    };
    assert.equal(select(doc).pin.commit, COMMIT_B);
  });
});

describe('selectCanonicalPin — fail-closed', () => {
  const rejects = (doc, match) => assert.throws(() => select(doc), match);

  it('rejects a document with no verified pin', () => {
    rejects(
      { pins: [{ commit: COMMIT_A, status: 'pending', packages: { '@frihet/sdk': '1.2.0' } }] },
      /no pin has status "verified"/,
    );
  });

  it('rejects an empty pins array', () => {
    rejects({ pins: [] }, /pins is empty/);
  });

  it('rejects pins that is not an array (object)', () => {
    rejects({ pins: { '1.3.0': pin(COMMIT_A, '1.3.0', '1.3.0') } }, /must be an array/);
  });

  it('rejects a non-object document', () => {
    rejects([pin(COMMIT_A, '1.3.0', '1.3.0')], /must be a JSON object/);
    rejects(null, /must be a JSON object/);
    rejects('nope', /must be a JSON object/);
  });

  it('rejects a pin entry that is not an object', () => {
    rejects({ pins: ['0cbf003'] }, /must be an object/);
  });

  it('rejects a missing status', () => {
    const bad = pin(COMMIT_A, '1.3.0', '1.3.0');
    delete bad.status;
    rejects({ pins: [bad] }, /status must be exactly "verified" or "pending"/);
  });

  it('rejects an unknown status', () => {
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0', { status: 'published' })] }, /status must be exactly/);
  });

  it('rejects a status with the wrong case ("Verified")', () => {
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0', { status: 'Verified' })] }, /status must be exactly/);
  });

  it('rejects verified without verifiedAt', () => {
    const bad = pin(COMMIT_A, '1.3.0', '1.3.0');
    delete bad.verifiedAt;
    rejects({ pins: [bad] }, /requires verifiedAt/);
  });

  it('rejects a verifiedAt that is not a real calendar date', () => {
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0', { verifiedAt: '2026-13-45' })] }, /requires verifiedAt/);
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0', { verifiedAt: '30-08-2026' })] }, /requires verifiedAt/);
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0', { verifiedAt: '2026-02-30' })] }, /requires verifiedAt/);
  });

  it('rejects a commit that is not 40 lowercase hex characters', () => {
    rejects({ pins: [pin('0cbf003', '1.3.0', '1.3.0')] }, /40 lowercase hex/);
    rejects({ pins: [pin('A'.repeat(40), '1.3.0', '1.3.0')] }, /40 lowercase hex/);
    rejects({ pins: [pin('z'.repeat(40), '1.3.0', '1.3.0')] }, /40 lowercase hex/);
    rejects({ pins: [pin(`${COMMIT_A}0`, '1.3.0', '1.3.0')] }, /40 lowercase hex/);
    rejects({ pins: [pin(null, '1.3.0', '1.3.0')] }, /40 lowercase hex/);
  });

  it('rejects missing, empty or non-object packages', () => {
    const noPackages = pin(COMMIT_A, '1.3.0', '1.3.0');
    delete noPackages.packages;
    rejects({ pins: [noPackages] }, /packages must be an object/);
    rejects({ pins: [{ ...pin(COMMIT_A, '1.3.0', '1.3.0'), packages: {} }] }, /packages is empty/);
    rejects({ pins: [{ ...pin(COMMIT_A, '1.3.0', '1.3.0'), packages: [] }] }, /packages must be an object/);
  });

  it('rejects a non-string version', () => {
    rejects({ pins: [{ ...pin(COMMIT_A, '1.3.0', '1.3.0'), packages: { '@frihet/sdk': 130 } }] }, /must be a string/);
  });

  it('rejects versions that are not strict MAJOR.MINOR.PATCH', () => {
    for (const version of ['1.2', '01.2.0', '1.2.0-rc.1', '1.2.0+build.5', 'v1.2.0', '1.2.0.0', '1.02.0', '', ' 1.2.0']) {
      rejects({ pins: [pin(COMMIT_A, version, '1.3.0')] }, /strict MAJOR\.MINOR\.PATCH/);
    }
  });

  it('rejects two verified pins claiming the same version of the same package', () => {
    rejects(
      { pins: [pin(COMMIT_A, '1.3.0', '1.3.0'), pin(COMMIT_B, '1.3.0', '1.4.0')] },
      /duplicate version, ambiguous authority/,
    );
  });

  it('rejects a verified pin whose package set is not the repo\'s (dropped or extra)', () => {
    const wider = {
      commit: COMMIT_B,
      status: 'verified',
      verifiedAt: '2026-08-30',
      packages: { '@frihet/sdk': '1.4.0', frihet: '1.4.0', '@frihet/extra': '1.0.0' },
    };
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0'), wider] }, /must cover exactly the packages the drift gate compares/);

    const narrower = { commit: COMMIT_C, status: 'verified', verifiedAt: '2026-08-30', packages: { '@frihet/sdk': '9.0.0' } };
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0'), narrower] }, /must cover exactly the packages the drift gate compares/);
  });

  it('rejects crossing versions between two verified pins (no total maximum)', () => {
    rejects(
      { pins: [pin(COMMIT_A, '1.3.0', '1.2.0'), pin(COMMIT_B, '1.2.0', '1.3.0')] },
      /versions cross between pins/,
    );
  });

  it('fails closed the moment a malformed pending pin is flipped to verified', () => {
    // Backs the leniency claim in resolve-release-pin.mjs: pending entries are only
    // ignored *while pending*. Promotion re-enters strict validation.
    const broken = { commit: 'NOT-A-SHA', status: 'pending', packages: { '@frihet/sdk': '9.0.0', frihet: '9.0.0' } };
    assert.equal(select({ pins: [pin(COMMIT_B, '1.3.0', '1.3.0'), broken] }).pin.commit, COMMIT_B);
    rejects({ pins: [pin(COMMIT_B, '1.3.0', '1.3.0'), { ...broken, status: 'verified', verifiedAt: '2026-08-30' }] }, /40 lowercase hex/);
  });

  it('rejects an unknown status even when a healthy verified pin is also present', () => {
    // The status check must not be skippable by hiding a junk entry behind a good one.
    const junk = pin(COMMIT_C, '1.1.0', '1.1.0', { status: 'probably-fine' });
    rejects({ pins: [pin(COMMIT_B, '1.3.0', '1.3.0'), junk] }, /status must be exactly/);
  });

  it('rejects trailing whitespace in commit and version (anchors are strict)', () => {
    rejects({ pins: [pin(`${COMMIT_A}\n`, '1.3.0', '1.3.0')] }, /40 lowercase hex/);
    rejects({ pins: [pin(`${COMMIT_A} `, '1.3.0', '1.3.0')] }, /40 lowercase hex/);
    rejects({ pins: [pin(COMMIT_A, '1.3.0\n', '1.3.0')] }, /strict MAJOR\.MINOR\.PATCH/);
  });

  it('rejects an empty package name', () => {
    rejects({ pins: [{ ...pin(COMMIT_A, '1.3.0', '1.3.0'), packages: { '': '1.3.0' } }] }, /is not a valid npm package name/);
  });
});

describe('CLI', () => {
  it('resolves the repo\'s real publish-pins.json to the 1.3.0 commit, not pins[0]', () => {
    const doc = JSON.parse(readFileSync(REAL_PINS, 'utf8'));
    assert.equal(doc.pins[0].packages['@frihet/sdk'], '1.2.0', 'precondition: pins[0] is still the older release');

    const { pin: selected } = select(doc);
    assert.equal(selected.commit, '0cbf003c1926fadaea0d343294417812ec3be133');
    assert.deepEqual(selected.packages, { '@frihet/sdk': '1.3.0', frihet: '1.3.0' });

    const run = runCli();
    assert.equal(run.status, 0);
    assert.deepEqual(JSON.parse(run.stdout), {
      commit: '0cbf003c1926fadaea0d343294417812ec3be133',
      packages: { '@frihet/sdk': '1.3.0', frihet: '1.3.0' },
      verifiedAt: '2026-08-30',
    });
    assert.match(run.stderr, /selected @frihet\/sdk@1\.3\.0 \+ frihet@1\.3\.0/);
    assert.match(run.stderr, /2 verified, 0 pending ignored/);
  });

  it('resolves the same commit when the real pins file is reversed', () => {
    const doc = JSON.parse(readFileSync(REAL_PINS, 'utf8'));
    const file = writePins({ ...doc, pins: [...doc.pins].reverse() });
    const run = runCli(['--pins', file]);
    assert.equal(run.status, 0);
    assert.equal(JSON.parse(run.stdout).commit, '0cbf003c1926fadaea0d343294417812ec3be133');
  });

  it('exits 3 when no pin is verified', () => {
    const file = writePins({ pins: [{ commit: COMMIT_A, status: 'pending', packages: { '@frihet/sdk': '1.3.0' } }] });
    const run = runCli(['--pins', file]);
    assert.equal(run.status, 3);
    assert.match(run.stderr, /\[release-pin\] FAIL-CLOSED: no pin has status "verified"/);
    assert.equal(run.stdout, '', 'a fail-closed run must not emit a machine-readable selection');
  });

  it('exits 3 on invalid JSON', () => {
    const file = writePins('{ "pins": [ ');
    const run = runCli(['--pins', file]);
    assert.equal(run.status, 3);
    assert.match(run.stderr, /cannot parse .* as JSON/);
  });

  it('exits 3 on a missing pins file', () => {
    const run = runCli(['--pins', join(tempDir(), 'does-not-exist.json')]);
    assert.equal(run.status, 3);
    assert.match(run.stderr, /cannot read /);
  });

  it('exits 3 on an unknown argument', () => {
    const run = runCli(['--allow-anything']);
    assert.equal(run.status, 3);
    assert.match(run.stderr, /unknown argument\(s\): --allow-anything/);
  });

  it('exits 3 when --pins has no value', () => {
    const run = runCli(['--pins']);
    assert.equal(run.status, 3);
    assert.match(run.stderr, /--pins requires a file path/);
  });

  it('writes commit= and versions= to $GITHUB_OUTPUT with --github-output', () => {
    const outFile = join(tempDir(), 'gh-output');
    writeFileSync(outFile, '');
    const run = runCli(['--github-output'], { GITHUB_OUTPUT: outFile });
    assert.equal(run.status, 0);
    const written = readFileSync(outFile, 'utf8');
    assert.match(written, /^commit=0cbf003c1926fadaea0d343294417812ec3be133$/m);
    assert.match(written, /^versions=@frihet\/sdk@1\.3\.0,frihet@1\.3\.0$/m);
  });

  it('exits 3 when --github-output is requested but GITHUB_OUTPUT is unset', () => {
    const run = runCli(['--github-output']);
    assert.equal(run.status, 3);
    assert.match(run.stderr, /GITHUB_OUTPUT is not set/);
  });

  it('reports the pending count it ignored', () => {
    const file = writePins({
      pins: [
        pin(COMMIT_A, '1.2.0', '1.2.0'),
        pin(COMMIT_B, '1.3.0', '1.3.0'),
        { commit: COMMIT_C, status: 'pending', packages: { '@frihet/sdk': '1.4.0', frihet: '1.4.0' } },
      ],
    });
    const run = runCli(['--pins', file]);
    assert.equal(run.status, 0);
    assert.equal(JSON.parse(run.stdout).commit, COMMIT_B);
    assert.match(run.stderr, /2 verified, 1 pending ignored/);
  });
});

/**
 * Round 2 — pinning tests for the four findings raised by the cross-model
 * adversarial review. Each `it` below carries the exact input that was
 * reproduced exiting 0 (or selecting the wrong pin) before the fix.
 */
describe('Round 2 — cross-model review findings', () => {
  const rejects = (doc, match, expected = EXPECTED_PACKAGES) =>
    assert.throws(() => selectCanonicalPin(doc, { expectedPackages: expected }), match);

  describe('1. GITHUB_OUTPUT injection via package name', () => {
    // The reproduced attack: this name carries newlines, so `versions=<names>`
    // used to append a SECOND `commit=bbbb…` line. The runner's parser takes the
    // last assignment, so steps.pin.outputs.commit became the injected SHA and
    // the workflow would check out an attacker-chosen commit.
    const INJECTED = 'x\ncommit=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\nx=';
    const injectionDoc = {
      pins: [
        {
          commit: 'a'.repeat(40),
          status: 'verified',
          verifiedAt: '2026-08-30',
          packages: { [INJECTED]: '1.0.0' },
        },
      ],
    };

    it('rejects the injecting package name (pure)', () => {
      rejects(injectionDoc, /is not a valid npm package name/, [INJECTED]);
    });

    it('exits 3 and writes NO commit line to $GITHUB_OUTPUT (CLI, end to end)', () => {
      const file = writePins(injectionDoc);
      const outFile = join(tempDir(), 'gh-output');
      writeFileSync(outFile, '');
      const run = runCli(['--pins', file, '--github-output'], { GITHUB_OUTPUT: outFile });
      assert.equal(run.status, 3);
      assert.match(run.stderr, /is not a valid npm package name/);
      assert.equal(readFileSync(outFile, 'utf8'), '', 'nothing may reach GITHUB_OUTPUT on a fail-closed run');
      assert.doesNotMatch(readFileSync(outFile, 'utf8'), /commit=b/);
    });

    it('rejects carriage returns, uppercase and spaces in package names', () => {
      for (const name of ['x\rcommit=y', 'Frihet', '@Frihet/sdk', 'frihet sdk', 'x\ncommit=y', '.hidden', '_leading']) {
        rejects(
          { pins: [{ commit: 'a'.repeat(40), status: 'verified', verifiedAt: '2026-08-30', packages: { [name]: '1.0.0' } }] },
          /is not a valid npm package name/,
          [name],
        );
      }
    });

    it('accepts exactly 214 characters and rejects 215 (both boundaries)', () => {
      const at214 = 'a'.repeat(214);
      const at215 = 'a'.repeat(215);
      assert.equal(at214.length, 214);
      assert.equal(at215.length, 215);
      assert.equal(npmPackageNameError(at214), null);
      assert.match(npmPackageNameError(at215), /more than 214 characters/);
      rejects(
        { pins: [{ commit: 'a'.repeat(40), status: 'verified', verifiedAt: '2026-08-30', packages: { [at215]: '1.0.0' } }] },
        /is not a valid npm package name/,
        [at215],
      );
    });

    it('assertSingleLine itself refuses multi-line values (belt and braces, tested directly)', () => {
      assert.throws(() => assertSingleLine('commit', 'aaa\ncommit=bbb'), /refusing to write a multi-line value/);
      assert.throws(() => assertSingleLine('versions', 'a\rb'), /refusing to write a multi-line value/);
      assert.doesNotThrow(() => assertSingleLine('commit', 'a'.repeat(40)));
    });
  });

  describe('2. package set must equal what this repo publishes', () => {
    it('discovers the repo\'s real publishable packages from the filesystem', () => {
      assert.deepEqual(discoverPublishablePackages(), ['@frihet/sdk', 'frihet']);
    });

    it('rejects a lone pin naming a package this repo does not publish', () => {
      // Reproduced exiting 0 and reporting `bogus@9.0.0` as the canonical release.
      const doc = {
        pins: [{ commit: 'a'.repeat(40), status: 'verified', verifiedAt: '2026-08-30', packages: { bogus: '9.0.0' } }],
      };
      rejects(doc, /pins \[bogus\] but this repo publishes \[@frihet\/sdk, frihet\]/);

      const run = runCli(['--pins', writePins(doc)]);
      assert.equal(run.status, 3);
      assert.match(run.stderr, /must cover exactly the packages the drift gate compares/);
    });

    it('rejects a pin missing one of the published packages', () => {
      const doc = {
        pins: [{ commit: 'a'.repeat(40), status: 'verified', verifiedAt: '2026-08-30', packages: { '@frihet/sdk': '1.3.0' } }],
      };
      rejects(doc, /pins \[@frihet\/sdk\] but this repo publishes/);
    });

    it('rejects a pin carrying an extra package', () => {
      const doc = {
        pins: [
          {
            commit: 'a'.repeat(40),
            status: 'verified',
            verifiedAt: '2026-08-30',
            packages: { '@frihet/sdk': '1.3.0', frihet: '1.3.0', '@frihet/extra': '1.0.0' },
          },
        ],
      };
      rejects(doc, /but this repo publishes \[@frihet\/sdk, frihet\]/);
    });

    it('refuses to select at all without expectedPackages — no skippable weaker mode', () => {
      const doc = { pins: [pin(COMMIT_A, '1.3.0', '1.3.0')] };
      assert.throws(() => selectCanonicalPin(doc), /expectedPackages must be a non-empty array/);
      assert.throws(() => selectCanonicalPin(doc, { expectedPackages: [] }), /expectedPackages must be a non-empty array/);
      assert.throws(() => selectCanonicalPin(doc, { expectedPackages: [42] }), /expectedPackages must be a non-empty array/);
    });
  });

  describe('3. version components compare as BigInt, not Number', () => {
    // Number('9007199254740993') === Number('9007199254740992') past 2^53, which
    // collapsed these two CROSSING pins into a false "maximum" and exited 0.
    const crossingBeyond2to53 = {
      pins: [
        {
          commit: 'a'.repeat(40),
          status: 'verified',
          verifiedAt: '2026-08-30',
          packages: { '@frihet/sdk': '9007199254740993.0.0', frihet: '1.0.0' },
        },
        {
          commit: 'b'.repeat(40),
          status: 'verified',
          verifiedAt: '2026-08-30',
          packages: { '@frihet/sdk': '9007199254740992.0.0', frihet: '2.0.0' },
        },
      ],
    };

    it('exits 3 on pins that cross only beyond Number precision', () => {
      rejects(crossingBeyond2to53, /versions cross between pins/);
      const run = runCli(['--pins', writePins(crossingBeyond2to53)]);
      assert.equal(run.status, 3);
      assert.match(run.stderr, /versions cross between pins/);
    });

    it('still orders huge versions correctly when they do not cross', () => {
      const doc = {
        pins: [
          pin(COMMIT_A, '9007199254740992.0.0', '9007199254740992.0.0'),
          pin(COMMIT_B, '9007199254740993.0.0', '9007199254740993.0.0'),
        ],
      };
      assert.equal(select(doc).pin.commit, COMMIT_B);
    });
  });

  describe('4. two verified pins may not share a commit', () => {
    it('exits 3 when the same commit claims two different releases', () => {
      const doc = { pins: [pin(COMMIT_A, '1.2.0', '1.2.0'), pin(COMMIT_A, '1.3.0', '1.3.0')] };
      rejects(doc, /share commit a{40} — one commit cannot have produced two releases/);
      const run = runCli(['--pins', writePins(doc)]);
      assert.equal(run.status, 3);
      assert.match(run.stderr, /one commit cannot have produced two releases/);
    });
  });
});

/**
 * Round 3 — pinning tests for the second cross-model review. Same convention:
 * each `it` carries the exact input that was reproduced passing before the fix.
 */
describe('Round 3 — cross-model review findings', () => {
  const rejects = (doc, match, expected = EXPECTED_PACKAGES) =>
    assert.throws(() => selectCanonicalPin(doc, { expectedPackages: expected }), match);

  /** Build a fake checked-out tree: <dir>/packages/<x>/package.json */
  function makeTree(packages) {
    const dir = tempDir();
    for (const [name, manifest] of Object.entries(packages)) {
      const pkgDir = join(dir, 'packages', name);
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    }
    return dir;
  }

  describe('1. the pin must describe the tree that was checked out', () => {
    const pinned = pin(COMMIT_A, '999.0.0', '999.0.0');

    it('rejects a tree whose manifests are a different release than the pin claims', () => {
      // The reproduced hole: declare an old commit as 999.0.0, win selection on
      // that number, and the workflow rebuilds a tree that is really 1.2.0 —
      // --expect-in-sync then passes and "reproducibility holds" for a release
      // that was never re-proven.
      const tree = makeTree({
        sdk: { name: '@frihet/sdk', version: '1.2.0' },
        cli: { name: 'frihet', version: '1.2.0' },
      });
      assert.throws(
        () => assertTreeMatchesPin(pinned, tree),
        /is not the release the pin claims .* pin says 999\.0\.0, tree says 1\.2\.0/,
      );
    });

    it('rejects a tree missing one of the pinned packages', () => {
      const tree = makeTree({ sdk: { name: '@frihet/sdk', version: '999.0.0' } });
      assert.throws(() => assertTreeMatchesPin(pinned, tree), /the pin does not describe this tree/);
    });

    it('rejects a tree carrying an extra publishable package', () => {
      const tree = makeTree({
        sdk: { name: '@frihet/sdk', version: '999.0.0' },
        cli: { name: 'frihet', version: '999.0.0' },
        extra: { name: '@frihet/extra', version: '1.0.0' },
      });
      assert.throws(() => assertTreeMatchesPin(pinned, tree), /the pin does not describe this tree/);
    });

    it('ignores private packages in the tree, like the detector does', () => {
      const tree = makeTree({
        sdk: { name: '@frihet/sdk', version: '999.0.0' },
        cli: { name: 'frihet', version: '999.0.0' },
        internal: { name: '@frihet/internal', version: '0.0.1', private: true },
      });
      assert.doesNotThrow(() => assertTreeMatchesPin(pinned, tree));
    });

    it('accepts a tree that matches the pin exactly', () => {
      const tree = makeTree({
        sdk: { name: '@frihet/sdk', version: '999.0.0' },
        cli: { name: 'frihet', version: '999.0.0' },
      });
      assert.doesNotThrow(() => assertTreeMatchesPin(pinned, tree));
    });

    it('rejects an unreadable tree', () => {
      assert.throws(() => assertTreeMatchesPin(pinned, join(tempDir(), 'nope')), /cannot read /);
    });

    it('exits 3 via the CLI when the tree disagrees with the pin', () => {
      const tree = makeTree({
        sdk: { name: '@frihet/sdk', version: '1.2.0' },
        cli: { name: 'frihet', version: '1.2.0' },
      });
      const file = writePins({ pins: [pinned] });
      const run = runCli(['--pins', file, '--assert-tree', tree]);
      assert.equal(run.status, 3);
      assert.match(run.stderr, /is not the release the pin claims/);
    });

    it('--assert-tree against this very repo passes (it IS the selected release)', () => {
      // The worktree's manifests are 1.3.0 and the canonical pin is the 1.3.0
      // pin, so the claim and the evidence agree. This is the positive control:
      // if it ever fails, either main moved past the newest verified pin without
      // adding one, or the binding itself broke.
      assert.deepEqual(
        readPublishableManifests(join(REPO_ROOT, 'packages')).map((m) => `${m.name}@${m.version}`),
        ['@frihet/sdk@1.3.0', 'frihet@1.3.0'],
      );
      const run = runCli(['--assert-tree', REPO_ROOT]);
      assert.equal(run.status, 0);
      assert.match(run.stderr, /matches the pin: @frihet\/sdk@1\.3\.0 \+ frihet@1\.3\.0/);
    });

    it('requires a path for --assert-tree', () => {
      const run = runCli(['--assert-tree']);
      assert.equal(run.status, 3);
      assert.match(run.stderr, /--assert-tree requires a directory path/);
    });
  });

  describe('2. duplicate JSON keys cannot smuggle order back in', () => {
    // JSON.parse keeps the LAST duplicate, so pin B below parsed to 3.0.0 and beat
    // pin A — and swapping the two duplicate literals flipped the outcome. Order
    // dependence through a channel the schema checks never see.
    const duplicateKeyFile = (first, second) =>
      writePins(
        `{\n  "pins": [\n    {\n      "commit": "${'a'.repeat(40)}",\n      "status": "verified",\n` +
          `      "verifiedAt": "2026-08-30",\n      "packages": {\n        "@frihet/sdk": "2.0.0",\n` +
          `        "frihet": "2.0.0"\n      }\n    },\n    {\n      "commit": "${'b'.repeat(40)}",\n` +
          `      "status": "verified",\n      "verifiedAt": "2026-08-30",\n      "packages": {\n` +
          `        "@frihet/sdk": "${first}",\n        "@frihet/sdk": "${second}",\n` +
          `        "frihet": "3.0.0"\n      }\n    }\n  ]\n}\n`,
      );

    it('exits 3 on a duplicate package key, in either order', () => {
      for (const [first, second] of [['1.0.0', '3.0.0'], ['3.0.0', '1.0.0']]) {
        const run = runCli(['--pins', duplicateKeyFile(first, second)]);
        assert.equal(run.status, 3, `order ${first}/${second}`);
        assert.match(run.stderr, /is not in canonical JSON form/);
      }
    });

    it('exits 3 on a duplicate top-level key', () => {
      const file = writePins(
        `{\n  "commit": "x",\n  "commit": "y",\n  "pins": [\n    {\n      "commit": "${'a'.repeat(40)}",\n` +
          `      "status": "verified",\n      "verifiedAt": "2026-08-30",\n      "packages": {\n` +
          `        "@frihet/sdk": "1.3.0",\n        "frihet": "1.3.0"\n      }\n    }\n  ]\n}\n`,
      );
      const run = runCli(['--pins', file]);
      assert.equal(run.status, 3);
      assert.match(run.stderr, /is not in canonical JSON form/);
    });

    it('exits 3 on tab indentation or trailing whitespace, and names the fix', () => {
      const doc = { pins: [pin(COMMIT_A, '1.3.0', '1.3.0')] };
      for (const raw of [
        JSON.stringify(doc, null, '\t') + '\n',
        JSON.stringify(doc, null, 2),
        `${JSON.stringify(doc, null, 2)}\n\n`,
        ` ${JSON.stringify(doc, null, 2)}\n`,
      ]) {
        const run = runCli(['--pins', writePins(raw)]);
        assert.equal(run.status, 3);
        assert.match(run.stderr, /is not in canonical JSON form/);
        // The message must tell the user how to fix it, not just that it is wrong.
        assert.match(run.stderr, /Rewrite it with: node -e/);
      }
    });

    it('accepts the repo\'s real pins file, which is canonical', () => {
      const raw = readFileSync(REAL_PINS, 'utf8');
      assert.equal(raw, `${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
      assert.equal(runCli().status, 0);
    });
  });

  describe('3. npm package-name grammar matches validate-npm-package-name', () => {
    it('rejects names the hand-rolled regex wrongly accepted', () => {
      for (const [name, reason] of [
        ['-pkg', /cannot start with a hyphen/],
        ['~pkg', /special characters/],
        ['node_modules', /node_modules is not a valid package name/],
        ['favicon.ico', /favicon\.ico is not a valid package name/],
      ]) {
        assert.match(npmPackageNameError(name), reason, name);
        rejects(
          { pins: [{ commit: 'a'.repeat(40), status: 'verified', verifiedAt: '2026-08-30', packages: { [name]: '1.0.0' } }] },
          /is not a valid npm package name/,
          [name],
        );
      }
    });

    it('accepts scoped names the hand-rolled regex wrongly rejected', () => {
      for (const name of ['@scope/_pkg', '@_scope/pkg', '@frihet/sdk', 'frihet', 'a', 'a-b.c_d', '@a/b']) {
        assert.equal(npmPackageNameError(name), null, name);
      }
    });

    it('still rejects the round-2 cases (no regression from the rewrite)', () => {
      for (const [name, reason] of [
        ['.hidden', /cannot start with a period/],
        ['_leading', /cannot start with an underscore/],
        ['Frihet', /capital letters/],
        ['@Frihet/sdk', /capital letters/],
        ['frihet sdk', /URL-friendly/],
        ['x\ncommit=y', /URL-friendly/],
        ['x\rcommit=y', /URL-friendly/],
        [' frihet', /leading or trailing spaces/],
        ['frihet ', /leading or trailing spaces/],
        ['', /length must be greater than zero/],
        ['@scope/.hidden', /cannot start with a period/],
      ]) {
        assert.match(npmPackageNameError(name), reason, JSON.stringify(name));
      }
      assert.match(npmPackageNameError(42), /must be a string/);
    });
  });

  describe('4. runs on Node 18 (engines.node >= 18)', () => {
    it('resolves paths without import.meta.dirname', () => {
      // import.meta.dirname landed in 20.11; on 18 it is undefined and the module
      // threw at import time, exiting 1 instead of this file's fail-closed 3.
      const source = readFileSync(RESOLVER, 'utf8');
      assert.doesNotMatch(
        source.replace(/^\s*\/\/.*$/gm, ''),
        /import\.meta\.dirname/,
        'resolver must not use import.meta.dirname outside comments',
      );
      assert.match(source, /fileURLToPath\(new URL\('\.\.', import\.meta\.url\)\)/);
    });
  });
});
