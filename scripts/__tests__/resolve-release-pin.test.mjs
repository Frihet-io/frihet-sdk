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
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { selectCanonicalPin } from '../resolve-release-pin.mjs';

const RESOLVER = resolve(import.meta.dirname, '..', 'resolve-release-pin.mjs');
const REAL_PINS = resolve(import.meta.dirname, '..', 'publish-pins.json');

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
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
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
    const { pin: selected, verifiedCount, pendingCount } = selectCanonicalPin(doc);
    assert.equal(selected.commit, COMMIT_B);
    assert.equal(verifiedCount, 2);
    assert.equal(pendingCount, 0);
  });

  it('selects the newest even when it is NOT pins[0] (the accidental-authority bug)', () => {
    const doc = { pins: [pin(COMMIT_B, '1.3.0', '1.3.0'), pin(COMMIT_A, '1.2.0', '1.2.0')] };
    assert.equal(selectCanonicalPin(doc).pin.commit, COMMIT_B);

    const reordered = { pins: [pin(COMMIT_A, '1.2.0', '1.2.0'), pin(COMMIT_B, '1.3.0', '1.3.0')] };
    assert.equal(selectCanonicalPin(reordered).pin.commit, COMMIT_B);
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
      assert.equal(selectCanonicalPin(doc).pin.commit, COMMIT_C, `order ${order.join('')}`);
    }
  });

  it('compares versions numerically, not lexicographically (1.10.0 > 1.9.0)', () => {
    const doc = { pins: [pin(COMMIT_A, '1.10.0', '1.10.0'), pin(COMMIT_B, '1.9.0', '1.9.0')] };
    assert.equal(selectCanonicalPin(doc).pin.commit, COMMIT_A);
  });

  it('compares patch numerically too (2.0.10 > 2.0.9)', () => {
    const doc = { pins: [pin(COMMIT_A, '2.0.9', '2.0.9'), pin(COMMIT_B, '2.0.10', '2.0.10')] };
    assert.equal(selectCanonicalPin(doc).pin.commit, COMMIT_B);
  });

  it('accepts a single verified pin', () => {
    const doc = { pins: [pin(COMMIT_A, '1.2.0', '1.2.0')] };
    assert.equal(selectCanonicalPin(doc).pin.commit, COMMIT_A);
  });

  it('ignores a pending pin with a HIGHER version — it cannot hijack the selection', () => {
    const doc = {
      pins: [
        pin(COMMIT_A, '1.2.0', '1.2.0'),
        pin(COMMIT_B, '1.3.0', '1.3.0'),
        { commit: COMMIT_C, status: 'pending', packages: { '@frihet/sdk': '1.4.0', frihet: '1.4.0' } },
      ],
    };
    const { pin: selected, verifiedCount, pendingCount } = selectCanonicalPin(doc);
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
    assert.equal(selectCanonicalPin(doc).pin.commit, COMMIT_A);
  });

  it('ignores a pending pin even when it is malformed — pending must never break selection', () => {
    const doc = {
      pins: [
        pin(COMMIT_B, '1.3.0', '1.3.0'),
        { commit: 'NOT-A-SHA', status: 'pending', packages: { '@frihet/sdk': 'nonsense' } },
      ],
    };
    assert.equal(selectCanonicalPin(doc).pin.commit, COMMIT_B);
  });
});

describe('selectCanonicalPin — fail-closed', () => {
  const rejects = (doc, match) => assert.throws(() => selectCanonicalPin(doc), match);

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

  it('rejects verified pins whose package sets differ (a dropped package must not look newer)', () => {
    const wider = {
      commit: COMMIT_B,
      status: 'verified',
      verifiedAt: '2026-08-30',
      packages: { '@frihet/sdk': '1.4.0', frihet: '1.4.0', '@frihet/extra': '1.0.0' },
    };
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0'), wider] }, /disagree on which packages they pin/);

    const narrower = { commit: COMMIT_C, status: 'verified', verifiedAt: '2026-08-30', packages: { '@frihet/sdk': '9.0.0' } };
    rejects({ pins: [pin(COMMIT_A, '1.3.0', '1.3.0'), narrower] }, /disagree on which packages they pin/);
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
    assert.equal(selectCanonicalPin({ pins: [pin(COMMIT_B, '1.3.0', '1.3.0'), broken] }).pin.commit, COMMIT_B);
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
    rejects({ pins: [{ ...pin(COMMIT_A, '1.3.0', '1.3.0'), packages: { '': '1.3.0' } }] }, /empty package name/);
  });
});

describe('CLI', () => {
  it('resolves the repo\'s real publish-pins.json to the 1.3.0 commit, not pins[0]', () => {
    const doc = JSON.parse(readFileSync(REAL_PINS, 'utf8'));
    assert.equal(doc.pins[0].packages['@frihet/sdk'], '1.2.0', 'precondition: pins[0] is still the older release');

    const { pin: selected } = selectCanonicalPin(doc);
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
