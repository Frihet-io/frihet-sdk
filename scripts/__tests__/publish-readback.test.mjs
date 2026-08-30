/**
 * Tests for scripts/publish-readback.mjs — zero dependencies, `node:test` only.
 *
 * Two layers:
 *   1. Pure-helper unit tests against hand-built manifests. These cover the cases
 *      that must never reach production — a `^` range or an unrewritten
 *      `workspace:*` in the published CLI manifest — which cannot be produced on
 *      demand from the real registry.
 *   2. Network tests against the IMMUTABLE facts of the 1.3.0 release. npm does
 *      not allow republishing a version, so `@frihet/sdk@1.3.0` and `frihet@1.3.0`
 *      are permanent fixtures: their sha512, their dist-tag and their absence of
 *      provenance attestations (both were published manually, before this
 *      workflow existed) cannot change underneath this suite.
 *
 * If the registry is unreachable the network tests FAIL rather than skip. A
 * suite that goes green because it silently tested nothing is the exact failure
 * mode the readback script exists to prevent.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  assertAttestations,
  assertVersionAbsent,
  assertExactDependencies,
  assertIntegrityMatchesLocal,
  assertLatestTag,
  assertServedTarballMatches,
  assertVersionPresent,
  parseArgs,
  sha512Integrity,
} from '../publish-readback.mjs';

const SCRIPT = resolve(import.meta.dirname, '..', 'publish-readback.mjs');
const REGISTRY = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';

/* -------------------------------------------------------------- *
 * Immutable 1.3.0 facts (verified 2026-08-30 against the registry)
 * -------------------------------------------------------------- */
const SDK_INTEGRITY =
  'sha512-Y9fiSL5RyPQrQhXDrg/TC0hpDIE4gGWzhYgoRoDYxzu326f3in0bsF6fQziIXrKbe+tcy5ttEW9E/CH1MWHAFQ==';
const CLI_INTEGRITY =
  'sha512-OBtGiWpBHuxvL14A0Nip+LR6hjosd1hCOXUgdi7nnBYDnq8PFJ/xFLPiCXhY8F75KpjtPwuokfcsgKVfNCfkRQ==';

/** Run the CLI and return its exit code + combined output. Never throws on non-zero. */
function runCli(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

/* ================================================================ *
 * 1. Pure helpers
 * ================================================================ */

describe('parseArgs', () => {
  it('accepts the minimal required set', () => {
    const o = parseArgs(['--package', 'frihet', '--version', '1.3.0', '--tarball', './a.tgz']);
    assert.equal(o.package, 'frihet');
    assert.equal(o.version, '1.3.0');
    assert.equal(o.tarball, './a.tgz');
    assert.equal(o.requireAttestations, false);
    assert.deepEqual(o.expectDependencies, []);
  });

  it('rejects an unknown flag rather than reading it as a weaker mode', () => {
    assert.throws(
      () => parseArgs(['--package', 'x', '--version', '1.0.0', '--tarball', 'a', '--force']),
      /unknown argument: --force/
    );
  });

  it('requires --package, --version and --tarball', () => {
    assert.throws(() => parseArgs(['--version', '1.0.0', '--tarball', 'a']), /--package is required/);
    assert.throws(() => parseArgs(['--package', 'x', '--tarball', 'a']), /--version is required/);
    assert.throws(() => parseArgs(['--package', 'x', '--version', '1.0.0']), /--tarball is required/);
  });

  it('rejects a flag whose value is missing', () => {
    assert.throws(() => parseArgs(['--package']), /--package requires a value/);
  });

  it('collects --expect-dependency repeatably and splits on the FIRST "="', () => {
    const o = parseArgs([
      '--package', 'frihet', '--version', '1.3.0', '--tarball', 'a',
      '--expect-dependency', '@frihet/sdk=1.3.0',
      '--expect-dependency', 'commander=13.0.0',
    ]);
    assert.deepEqual(o.expectDependencies, [
      ['@frihet/sdk', '1.3.0'],
      ['commander', '13.0.0'],
    ]);
  });

  it('rejects a malformed --expect-dependency', () => {
    const base = ['--package', 'x', '--version', '1.0.0', '--tarball', 'a', '--expect-dependency'];
    assert.throws(() => parseArgs([...base, 'nodelimiter']), /expects <name>=<exactVersion>/);
    assert.throws(() => parseArgs([...base, '=1.0.0']), /expects <name>=<exactVersion>/);
    assert.throws(() => parseArgs([...base, 'pkg=']), /expects <name>=<exactVersion>/);
  });

  it('--assert-absent does not require --tarball', () => {
    const o = parseArgs(['--package', 'frihet', '--version', '9.9.9', '--assert-absent']);
    assert.equal(o.assertAbsent, true);
    assert.equal(o.tarball, null);
  });

  it('--assert-absent refuses flags it would silently ignore', () => {
    const base = ['--package', 'frihet', '--version', '9.9.9', '--assert-absent'];
    assert.throws(() => parseArgs([...base, '--tarball', 'a.tgz']), /cannot be combined with --tarball/);
    assert.throws(() => parseArgs([...base, '--require-attestations']), /cannot be combined with --require-attestations/);
    assert.throws(
      () => parseArgs([...base, '--expect-dependency', 'x=1.0.0']),
      /cannot be combined with --expect-dependency/
    );
  });

  it('honours --registry and --require-attestations', () => {
    const o = parseArgs([
      '--package', 'x', '--version', '1.0.0', '--tarball', 'a',
      '--registry', 'https://example.test', '--require-attestations',
    ]);
    assert.equal(o.registry, 'https://example.test');
    assert.equal(o.requireAttestations, true);
  });
});

describe('sha512Integrity', () => {
  it('produces the npm "sha512-<base64>" form', () => {
    const buf = Buffer.from('frihet');
    const expected = `sha512-${createHash('sha512').update(buf).digest('base64')}`;
    assert.equal(sha512Integrity(buf), expected);
  });
});

describe('assertVersionPresent', () => {
  const doc = { versions: { '1.2.0': {}, '1.3.0': {} }, 'dist-tags': { latest: '1.3.0' } };

  it('passes when the version exists', () => {
    assert.match(assertVersionPresent(doc, 'frihet', '1.3.0'), /^ok version frihet@1\.3\.0/);
  });

  it('fails when the version is absent, naming the latest that does exist', () => {
    assert.throws(() => assertVersionPresent(doc, 'frihet', '9.9.9'), /not on the registry \(latest published: 1\.3\.0\)/);
  });

  it('fails on a document with no versions at all', () => {
    assert.throws(() => assertVersionPresent({ versions: {} }, 'frihet', '1.3.0'), /lists no versions at all/);
    assert.throws(() => assertVersionPresent({}, 'frihet', '1.3.0'), /lists no versions at all/);
  });
});

describe('assertIntegrityMatchesLocal', () => {
  it('passes on an exact match', () => {
    const entry = { dist: { integrity: SDK_INTEGRITY } };
    assert.match(assertIntegrityMatchesLocal(entry, '@frihet/sdk', '1.3.0', SDK_INTEGRITY), /^ok integrity/);
  });

  it('fails when the registry integrity differs from the local tarball', () => {
    const entry = { dist: { integrity: SDK_INTEGRITY } };
    assert.throws(
      () => assertIntegrityMatchesLocal(entry, '@frihet/sdk', '1.3.0', CLI_INTEGRITY),
      /registry dist\.integrity .* != local tarball/
    );
  });

  it('fails when dist.integrity is missing', () => {
    assert.throws(
      () => assertIntegrityMatchesLocal({ dist: {} }, 'p', '1.0.0', SDK_INTEGRITY),
      /has no dist\.integrity/
    );
  });

  it('refuses a non-sha512 integrity rather than comparing a weaker hash', () => {
    assert.throws(
      () => assertIntegrityMatchesLocal({ dist: { integrity: 'sha1-abc' } }, 'p', '1.0.0', SDK_INTEGRITY),
      /is not sha512/
    );
  });
});

describe('assertServedTarballMatches', () => {
  it('passes when the served bytes re-hash to the manifest integrity', () => {
    const buf = Buffer.from('the published bytes');
    const entry = { dist: { integrity: sha512Integrity(buf) } };
    assert.match(assertServedTarballMatches(entry, 'p', '1.0.0', buf), /^ok served tarball \(19 bytes\)/);
  });

  it('fails when the CDN serves different bytes than the manifest claims', () => {
    const entry = { dist: { integrity: sha512Integrity(Buffer.from('a')) } };
    assert.throws(
      () => assertServedTarballMatches(entry, 'p', '1.0.0', Buffer.from('b')),
      /tarball served by the registry hashes to/
    );
  });
});

describe('assertLatestTag', () => {
  it('passes when dist-tags.latest is the published version', () => {
    assert.match(assertLatestTag({ 'dist-tags': { latest: '1.3.0' } }, 'p', '1.3.0'), /^ok dist-tags\.latest/);
  });

  it('fails when latest points elsewhere', () => {
    assert.throws(() => assertLatestTag({ 'dist-tags': { latest: '1.2.0' } }, 'p', '1.3.0'), /latest is 1\.2\.0, expected 1\.3\.0/);
  });

  it('fails when there is no latest tag at all', () => {
    assert.throws(() => assertLatestTag({}, 'p', '1.3.0'), /latest is \(unset\)/);
  });
});

describe('assertAttestations', () => {
  it('passes when the registry records an attestation', () => {
    const entry = {
      dist: {
        attestations: {
          url: 'https://registry.npmjs.org/-/npm/v1/attestations/p@1.0.0',
          provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
        },
      },
    };
    assert.match(assertAttestations(entry, 'p', '1.0.0'), /^ok attestations present \(https:\/\/slsa\.dev\/provenance\/v1\)/);
  });

  it('fails when the version was published without provenance', () => {
    assert.throws(() => assertAttestations({ dist: {} }, 'p', '1.0.0'), /no dist\.attestations/);
  });

  it('fails when the attestation block has no url', () => {
    assert.throws(() => assertAttestations({ dist: { attestations: {} } }, 'p', '1.0.0'), /has no url/);
  });
});

describe('assertExactDependencies', () => {
  const exact = { dependencies: { '@frihet/sdk': '1.3.0', commander: '^13.0.0' } };

  it('passes on an exact pin', () => {
    const lines = assertExactDependencies(exact, 'frihet', '1.3.0', [['@frihet/sdk', '1.3.0']]);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /ok dependency @frihet\/sdk === "1\.3\.0"/);
  });

  it('REJECTS a caret range where an exact pin was required', () => {
    const caret = { dependencies: { '@frihet/sdk': '^1.3.0' } };
    assert.throws(
      () => assertExactDependencies(caret, 'frihet', '1.3.0', [['@frihet/sdk', '1.3.0']]),
      /is "\^1\.3\.0", expected exactly "1\.3\.0"/
    );
  });

  it('REJECTS an unrewritten workspace protocol — the tarball would be uninstallable', () => {
    const ws = { dependencies: { '@frihet/sdk': 'workspace:*' } };
    assert.throws(
      () => assertExactDependencies(ws, 'frihet', '1.3.0', [['@frihet/sdk', '1.3.0']]),
      /is "workspace:\*", expected exactly "1\.3\.0"/
    );
  });

  it('fails when the expected dependency is absent entirely', () => {
    assert.throws(
      () => assertExactDependencies({ dependencies: {} }, 'frihet', '1.3.0', [['@frihet/sdk', '1.3.0']]),
      /has no dependency "@frihet\/sdk"/
    );
    assert.throws(
      () => assertExactDependencies({}, 'frihet', '1.3.0', [['@frihet/sdk', '1.3.0']]),
      /has no dependency "@frihet\/sdk"/
    );
  });

  it('checks every expectation, not just the first', () => {
    assert.throws(
      () => assertExactDependencies(exact, 'frihet', '1.3.0', [
        ['@frihet/sdk', '1.3.0'],
        ['commander', '13.0.0'],
      ]),
      /dependencies\["commander"\] is "\^13\.0\.0"/
    );
  });

  it('returns no lines when nothing was expected', () => {
    assert.deepEqual(assertExactDependencies(exact, 'frihet', '1.3.0', []), []);
  });
});

describe('assertVersionAbsent', () => {
  const doc = { versions: { '1.2.0': {}, '1.3.0': {} }, 'dist-tags': { latest: '1.3.0' } };

  it('passes when the version has never been published', () => {
    assert.match(assertVersionAbsent(doc, 'frihet', '9.9.9'), /^ok frihet@9\.9\.9 is not on the registry \(2 version\(s\)/);
  });

  it('fails when the version already exists — this is the no-republish gate', () => {
    assert.throws(() => assertVersionAbsent(doc, 'frihet', '1.3.0'), /is ALREADY published/);
  });

  it('refuses to report absence from a malformed document instead of guessing', () => {
    assert.throws(() => assertVersionAbsent({}, 'frihet', '9.9.9'), /has no "versions" object/);
    assert.throws(() => assertVersionAbsent(null, 'frihet', '9.9.9'), /has no "versions" object/);
    assert.throws(() => assertVersionAbsent({ versions: null }, 'frihet', '9.9.9'), /has no "versions" object/);
  });

  it('treats a package with zero published versions as absent, not as an error', () => {
    assert.match(assertVersionAbsent({ versions: {} }, 'brand-new', '1.0.0'), /^ok brand-new@1\.0\.0 is not on the registry \(0 version\(s\)/);
  });
});

/* ================================================================ *
 * 2. CLI argument handling (no network needed — these fail before any fetch)
 * ================================================================ */

describe('CLI argument failures exit 3 before touching the network', () => {
  it('unknown argument -> exit 3', () => {
    const r = runCli(['--package', '@frihet/sdk', '--version', '1.3.0', '--tarball', 'x', '--yolo']);
    assert.equal(r.code, 3);
    assert.match(r.out, /FAIL-CLOSED: unknown argument: --yolo/);
  });

  it('missing --tarball -> exit 3', () => {
    const r = runCli(['--package', '@frihet/sdk', '--version', '1.3.0']);
    assert.equal(r.code, 3);
    assert.match(r.out, /FAIL-CLOSED: --tarball is required/);
  });

  it('unreadable local tarball -> exit 3', () => {
    const r = runCli(['--package', '@frihet/sdk', '--version', '1.3.0', '--tarball', '/nonexistent/nope.tgz']);
    assert.equal(r.code, 3);
    assert.match(r.out, /FAIL-CLOSED: cannot read local tarball/);
  });
});

/* ================================================================ *
 * 3. Network tests against the immutable 1.3.0 release
 * ================================================================ */

describe('live readback against the immutable 1.3.0 release', () => {
  let tmp;
  let sdkTgz;
  let cliTgz;
  let tamperedTgz;

  before(async () => {
    // Preflight: prove the registry is reachable. If it is not, fail loudly here
    // instead of letting every network assertion below fail with a confusing
    // message — or worse, being tempted to skip them.
    let doc;
    try {
      const res = await fetch(`${REGISTRY}/${encodeURIComponent('@frihet/sdk')}`, {
        headers: { accept: 'application/json' },
      });
      assert.ok(res.ok, `registry preflight returned HTTP ${res.status}`);
      doc = await res.json();
    } catch (err) {
      assert.fail(
        `REGISTRY UNREACHABLE (${REGISTRY}): ${err.message}. ` +
          'These tests are not skipped when the network is down — a green suite that tested nothing is worse than a red one.'
      );
    }
    assert.ok(doc.versions['1.3.0'], '@frihet/sdk@1.3.0 must exist — it is an immutable fixture');

    tmp = mkdtempSync(join(tmpdir(), 'publish-readback-test-'));
    const download = async (name, version, dest) => {
      const d = await (await fetch(`${REGISTRY}/${encodeURIComponent(name)}`)).json();
      const url = d.versions[version].dist.tarball;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      writeFileSync(dest, buf);
    };
    sdkTgz = join(tmp, 'sdk-1.3.0.tgz');
    cliTgz = join(tmp, 'cli-1.3.0.tgz');
    await download('@frihet/sdk', '1.3.0', sdkTgz);
    await download('frihet', '1.3.0', cliTgz);

    // A one-byte append: the smallest possible corruption a readback must catch.
    tamperedTgz = join(tmp, 'tampered.tgz');
    writeFileSync(tamperedTgz, readFileSync(sdkTgz));
    appendFileSync(tamperedTgz, 'X');
  });

  after(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('the downloaded fixtures hash to the recorded 1.3.0 integrities', () => {
    assert.equal(sha512Integrity(readFileSync(sdkTgz)), SDK_INTEGRITY);
    assert.equal(sha512Integrity(readFileSync(cliTgz)), CLI_INTEGRITY);
  });

  it('@frihet/sdk@1.3.0 passes without --require-attestations (exit 0)', () => {
    const r = runCli(['--package', '@frihet/sdk', '--version', '1.3.0', '--tarball', sdkTgz]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok integrity sha512-Y9fiSL5RyPQ/);
    assert.match(r.out, /ok dist-tags\.latest === 1\.3\.0/);
  });

  it('@frihet/sdk@1.3.0 FAILS with --require-attestations — 1.3.0 was published manually, without provenance (exit 3)', () => {
    const r = runCli([
      '--package', '@frihet/sdk', '--version', '1.3.0', '--tarball', sdkTgz, '--require-attestations',
    ]);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /no dist\.attestations .* published without provenance/);
  });

  it('a local tarball with one extra byte FAILS integrity (exit 3)', () => {
    const r = runCli(['--package', '@frihet/sdk', '--version', '1.3.0', '--tarball', tamperedTgz]);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /registry dist\.integrity .* != local tarball/);
  });

  it('frihet@1.3.0 with --expect-dependency @frihet/sdk=1.3.0 passes (exit 0)', () => {
    const r = runCli([
      '--package', 'frihet', '--version', '1.3.0', '--tarball', cliTgz,
      '--expect-dependency', '@frihet/sdk=1.3.0',
    ]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok dependency @frihet\/sdk === "1\.3\.0"/);
  });

  it('frihet@1.3.0 with --expect-dependency @frihet/sdk=1.2.0 fails (exit 3)', () => {
    const r = runCli([
      '--package', 'frihet', '--version', '1.3.0', '--tarball', cliTgz,
      '--expect-dependency', '@frihet/sdk=1.2.0',
    ]);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /expected exactly "1\.2\.0"/);
  });

  it('a version the registry has never seen fails (exit 3)', () => {
    const r = runCli(['--package', '@frihet/sdk', '--version', '9.9.9', '--tarball', sdkTgz]);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /9\.9\.9 is not on the registry/);
  });

  it('--assert-absent FAILS for the already-published 1.3.0 (exit 3)', () => {
    const r = runCli(['--package', '@frihet/sdk', '--version', '1.3.0', '--assert-absent']);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /1\.3\.0 is ALREADY published/);
  });

  it('--assert-absent PASSES for a version that has never existed (exit 0)', () => {
    const r = runCli(['--package', '@frihet/sdk', '--version', '9.9.9', '--assert-absent']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok @frihet\/sdk@9\.9\.9 is not on the registry/);
  });

  it('--assert-absent FAILS CLOSED when the registry is unreachable — an outage is not a "no" (exit 3)', () => {
    // Port 9 (discard) on loopback: refused immediately, no timeout, no DNS.
    const r = runCli([
      '--package', '@frihet/sdk', '--version', '9.9.9', '--assert-absent',
      '--registry', 'http://127.0.0.1:9',
    ]);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /Refusing to treat an unanswered question as "not published"/);
  });

  it('the CLI tarball published for 1.3.0 really carries a rewritten, exact SDK dependency', () => {
    const manifest = JSON.parse(
      execFileSync('tar', ['-xOzf', cliTgz, 'package/package.json'], { encoding: 'utf8' })
    );
    assert.equal(manifest.dependencies['@frihet/sdk'], '1.3.0');
    assert.doesNotMatch(manifest.dependencies['@frihet/sdk'], /workspace:|[\^~><*]/);
  });
});
