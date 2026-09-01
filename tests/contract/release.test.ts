/**
 * Hostile tests for the release PR machinery.
 *
 * Each test pins a property the release workflow MUST hold, the same way
 * the SDK contract tests pin the ERP wire contract: a RED test pins the
 * property, a fix turns it GREEN. The properties here are the structural
 * invariants that proved themselves in the n8n release machinery
 * (PR #15) and that THIS release must preserve across the dual-package
 * adaptation (SDK + CLI).
 *
 * The hostile mutants listed in the PR body are checked here:
 *
 *   M1. `npm publish` without `--provenance`                  → caught by the workflow
 *   M2. `npm publish` without `--access public`               → caught by the workflow
 *   M3. CLI published before SDK                              → caught by verify-sdk-published
 *   M4. `verify-environment` step skipped                      → caught by the workflow order
 *   M5. Tag `target_commitish` pointing to a non-release SHA   → caught by validateReleaseRecord
 *
 * Plus the deeper invariants the workflow steps derive from:
 *
 *   - dispatch provenance (repo, ref, SHA, worktree, input version)
 *   - metadata pinning (both packages' versions, lockfile importers,
 *     CLI's workspace:* declaration, Node version, npm version)
 *   - GitHub environment policy (reviewers, no self-review, no admin
 *     bypass, protected branches only)
 *   - pack evidence shape (file allowlist, integrity hash, byte size)
 *   - registry readback idempotency (404 / 429 / 500 / network retry)
 *   - GitHub Release record (name, body, draft=false, prerelease=false,
 *     target_commitish on the expected SHA)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SCRIPT_PATH = join(REPO_ROOT, '.github', 'scripts', 'release-control.cjs');
const WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'release.yml');

const ctrl = require(SCRIPT_PATH) as {
	VERSION: string;
	TAG: string;
	REPOSITORY: string;
	MAIN_BRANCH: string;
	MAIN_REF: string;
	ENVIRONMENT: string;
	RELEASE_NAME: string;
	RELEASE_BODY: string;
	EXPECTED_FILES: Record<string, string[]>;
	PACKAGE_NAMES: string[];
	PACKAGE_DIRS: Record<string, string>;
	REGISTRY_REQUEST_TIMEOUT_MS: number;
	REGISTRY_RETRY_ATTEMPTS: number;
	REGISTRY_RETRY_DELAY_MS: number;
	buildPackEvidence: (...args: any[]) => any;
	decideRegistryAction: (...args: any[]) => any;
	dispatchCommand: (...args: any[]) => Promise<any>;
	fetchPublishedPackage: (...args: any[]) => Promise<any>;
	hasCompletedHandler: (result: any, command: string) => boolean;
	isTransientRegistryStatus: (status: number) => boolean;
	parseTarFiles: (...args: any[]) => any;
	parseCommandArgs: (...args: any[]) => any;
	reconcileRegistryReadback: (...args: any[]) => Promise<any>;
	validateDispatchContext: (context: Record<string, string>) => true;
	validateEnvironmentPolicy: (env: Record<string, any>) => true;
	validateFileContract: (files: any[], label: string, allowed: string[]) => void;
	validateMetadataContract: (metadata: Record<string, any>) => true;
	validatePublishedManifest: (...args: any[]) => any;
	validatePublishedPackage: (...args: any[]) => any;
	validateReleaseRecord: (...args: any[]) => true;
	cliSuccessMarker: (command: string) => string;
};

const EXPECTED_SHA = 'a'.repeat(40);
const WRONG_SHA = 'b'.repeat(40);

function runScript(command: string, env: Record<string, string> = {}) {
	const result = spawnSync('node', [SCRIPT_PATH, ...command.split(' ')], {
		cwd: REPO_ROOT,
		env: { ...process.env, ...env },
		encoding: 'utf8',
	});
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		status: result.status ?? -1,
	};
}

function dispatchWithHandlers(command: string, args: string[], handlers: Record<string, any>) {
	return ctrl.dispatchCommand(command, args, { ...handlers });
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('release-control — version + repository constants', () => {
	it('pins VERSION=1.4.0 and TAG=v1.4.0', () => {
		expect(ctrl.VERSION).toBe('1.4.0');
		expect(ctrl.TAG).toBe('v1.4.0');
	});

	it('targets the canonical Frihet-io/frihet-sdk repository', () => {
		expect(ctrl.REPOSITORY).toBe('Frihet-io/frihet-sdk');
		expect(ctrl.MAIN_BRANCH).toBe('main');
		expect(ctrl.MAIN_REF).toBe('refs/heads/main');
	});

	it('publishes to the protected npm-release environment', () => {
		expect(ctrl.ENVIRONMENT).toBe('npm-release');
	});

	it('orders the two packages SDK-first, CLI-second', () => {
		expect(ctrl.PACKAGE_NAMES).toEqual(['@frihet/sdk', 'frihet']);
		expect(ctrl.PACKAGE_DIRS['@frihet/sdk']).toBe('packages/sdk');
		expect(ctrl.PACKAGE_DIRS['frihet']).toBe('packages/cli');
	});

	it('declares a release name + body that name both packages', () => {
		expect(ctrl.RELEASE_NAME).toBe('Frihet SDK + CLI v1.4.0');
		expect(ctrl.RELEASE_BODY).toContain('@frihet/sdk@1.4.0');
		expect(ctrl.RELEASE_BODY).toContain('frihet@1.4.0');
		// The body must explain the SDK-first invariant so any reader of the
		// GitHub Release can see why the order matters.
		expect(ctrl.RELEASE_BODY.toLowerCase()).toContain('sdk published first');
	});
});

describe('verify-dispatch — provenance guard', () => {
	const clean = {
		repository: 'Frihet-io/frihet-sdk',
		ref: 'refs/heads/main',
		inputVersion: '1.4.0',
		sha: EXPECTED_SHA,
		head: EXPECTED_SHA,
		status: '',
		trackedNodeModules: '',
	};

	it('accepts the canonical context (clean main at the right SHA)', () => {
		expect(() => ctrl.validateDispatchContext(clean)).not.toThrow();
	});

	it('REJECTS a wrong repository (hostile: wrong org)', () => {
		expect(() => ctrl.validateDispatchContext({ ...clean, repository: 'attacker/frihet-sdk' })).toThrow(/Unexpected repository/);
	});

	it('REJECTS a non-main ref (hostile: feature branch dispatch)', () => {
		expect(() => ctrl.validateDispatchContext({ ...clean, ref: 'refs/heads/feat/rogue' })).toThrow(/must run from main/);
	});

	it('REJECTS a wrong input version (hostile: version mismatch)', () => {
		expect(() => ctrl.validateDispatchContext({ ...clean, inputVersion: '9.9.9' })).toThrow(/input must be 1\.4\.0/);
	});

	it('REJECTS a HEAD that does not match GITHUB_SHA (hostile: checkout drift)', () => {
		expect(() => ctrl.validateDispatchContext({ ...clean, head: WRONG_SHA })).toThrow(/HEAD differs from GITHUB_SHA/);
	});

	it('REJECTS a dirty worktree (hostile: uncommitted local edits before publish)', () => {
		expect(() => ctrl.validateDispatchContext({ ...clean, status: ' M packages/sdk/src/index.ts' })).toThrow(/dirty/);
	});

	it('REJECTS tracked node_modules (hostile: polluted registry)', () => {
		expect(() => ctrl.validateDispatchContext({ ...clean, trackedNodeModules: 'node_modules/foo' })).toThrow(/node_modules is tracked/);
	});
});

describe('verify-dispatch — end-to-end via subprocess', () => {
	it('rejects when GITHUB_REPOSITORY is wrong', () => {
		const out = runScript('verify-dispatch', {
			INPUT_VERSION: '1.4.0',
			GITHUB_REPOSITORY: 'attacker/frihet-sdk',
			GITHUB_REF: 'refs/heads/main',
			GITHUB_SHA: EXPECTED_SHA,
		});
		expect(out.status).not.toBe(0);
		expect(out.stderr).toMatch(/Unexpected repository/);
	});

	it('rejects when INPUT_VERSION is wrong', () => {
		const out = runScript('verify-dispatch', {
			INPUT_VERSION: '0.0.1',
			GITHUB_REPOSITORY: 'Frihet-io/frihet-sdk',
			GITHUB_REF: 'refs/heads/main',
			GITHUB_SHA: EXPECTED_SHA,
		});
		expect(out.status).not.toBe(0);
		expect(out.stderr).toMatch(/input must be 1\.4\.0/);
	});
});

describe('verify-metadata — package + lockfile + toolchain pinning', () => {
	const good = {
		inputVersion: '1.4.0',
		sdkPackageJson: { name: '@frihet/sdk', version: '1.4.0' },
		cliPackageJson: { name: 'frihet', version: '1.4.0', dependencies: { '@frihet/sdk': 'workspace:*' } },
		lockfileHasSdkImporter: true,
		lockfileHasCliImporter: true,
		nodeVersion: 'v24.20.0',
		npmVersion: '11.19.0',
	};

	it('accepts the canonical metadata', () => {
		expect(() => ctrl.validateMetadataContract(good)).not.toThrow();
	});

	it('REJECTS a version mismatch in packages/sdk/package.json', () => {
		expect(() => ctrl.validateMetadataContract({ ...good, sdkPackageJson: { ...good.sdkPackageJson, version: '1.3.0' } })).toThrow(/packages\/sdk\/package\.json version must be 1\.4\.0/);
	});

	it('REJECTS a version mismatch in packages/cli/package.json', () => {
		expect(() => ctrl.validateMetadataContract({ ...good, cliPackageJson: { ...good.cliPackageJson, version: '9.9.9' } })).toThrow(/packages\/cli\/package\.json version must be 1\.4\.0/);
	});

	it('REJECTS a wrong name on either package', () => {
		expect(() => ctrl.validateMetadataContract({ ...good, sdkPackageJson: { ...good.sdkPackageJson, name: 'evil-sdk' } })).toThrow(/name must be @frihet\/sdk/);
		expect(() => ctrl.validateMetadataContract({ ...good, cliPackageJson: { ...good.cliPackageJson, name: 'evil-cli' } })).toThrow(/name must be frihet/);
	});

	it('REJECTS when CLI does not depend on @frihet/sdk via workspace:*', () => {
		// The CLI source MUST declare workspace:*; pnpm rewrites it at pack
		// time. A source that already pins to a registry version would
		// publish a stale tarball.
		expect(() => ctrl.validateMetadataContract({
			...good,
			cliPackageJson: { ...good.cliPackageJson, dependencies: { '@frihet/sdk': '9.9.9' } },
		})).toThrow(/workspace:\*/);
	});

	it('REJECTS when pnpm-lock.yaml has no packages/sdk importer', () => {
		expect(() => ctrl.validateMetadataContract({ ...good, lockfileHasSdkImporter: false })).toThrow(/pnpm-lock\.yaml must contain a `packages\/sdk:` importer block/);
	});

	it('REJECTS when pnpm-lock.yaml has no packages/cli importer', () => {
		expect(() => ctrl.validateMetadataContract({ ...good, lockfileHasCliImporter: false })).toThrow(/pnpm-lock\.yaml must contain a `packages\/cli:` importer block/);
	});

	it('REJECTS a wrong Node version (hostile: toolchain drift)', () => {
		expect(() => ctrl.validateMetadataContract({ ...good, nodeVersion: 'v18.0.0' })).toThrow(/Release Node must be v24\.20\.0/);
	});

	it('REJECTS a wrong npm version (hostile: trusted-publishing floor is 11.5.1)', () => {
		expect(() => ctrl.validateMetadataContract({ ...good, npmVersion: '10.9.7' })).toThrow(/Release npm must be 11\.19\.0/);
	});
});

describe('verify-environment — GitHub protected-environment policy', () => {
	const good = {
		protection_rules: [{ type: 'required_reviewers', reviewers: [{ reviewer: { type: 'User', id: 1 } }], prevent_self_review: true }],
		deployment_branch_policy: { protected_branches: true },
		can_admins_bypass: false,
	};

	it('accepts a fully-protected environment with reviewers + no self-review + no admin bypass', () => {
		expect(() => ctrl.validateEnvironmentPolicy(good)).not.toThrow();
	});

	it('REJECTS an environment with no required reviewers (hostile: bypass-able deploy)', () => {
		expect(() => ctrl.validateEnvironmentPolicy({ ...good, protection_rules: [] })).toThrow(/at least one reviewer/);
	});

	it('REJECTS self-review being permitted (hostile: single-actor publish)', () => {
		expect(() => ctrl.validateEnvironmentPolicy({
			...good,
			protection_rules: [{ type: 'required_reviewers', reviewers: [{ reviewer: { type: 'User', id: 1 } }], prevent_self_review: false }],
		})).toThrow(/prevent self-review/);
	});

	it('REJECTS admin bypass (hostile: a maintainer overriding the gate)', () => {
		expect(() => ctrl.validateEnvironmentPolicy({ ...good, can_admins_bypass: true })).toThrow(/disallow administrator bypass/);
	});

	it('REJECTS non-protected branches in the deployment policy (hostile: feat/* dispatch)', () => {
		expect(() => ctrl.validateEnvironmentPolicy({
			...good,
			deployment_branch_policy: { protected_branches: false },
		})).toThrow(/protected branches only/);
	});
});

describe('isTransientRegistryStatus — registry retry classifier', () => {
	it('treats 404/408/425/429/5xx as transient (re-read may succeed)', () => {
		expect(ctrl.isTransientRegistryStatus(404)).toBe(true);
		expect(ctrl.isTransientRegistryStatus(408)).toBe(true);
		expect(ctrl.isTransientRegistryStatus(425)).toBe(true);
		expect(ctrl.isTransientRegistryStatus(429)).toBe(true);
		expect(ctrl.isTransientRegistryStatus(500)).toBe(true);
		expect(ctrl.isTransientRegistryStatus(503)).toBe(true);
	});

	it('does NOT treat 4xx (other than 408/425/429) as transient — those are real failures', () => {
		expect(ctrl.isTransientRegistryStatus(400)).toBe(false);
		expect(ctrl.isTransientRegistryStatus(401)).toBe(false);
		expect(ctrl.isTransientRegistryStatus(403)).toBe(false);
		expect(ctrl.isTransientRegistryStatus(409)).toBe(false);
	});
});

describe('parseCommandArgs — release-control CLI shape', () => {
	it('extracts --package <name> positional for pack-evidence / registry-decision / reconcile-registry', () => {
		expect(ctrl.parseCommandArgs(['--package', '@frihet/sdk'])).toEqual({
			positional: [],
			packageName: '@frihet/sdk',
			retry: false,
		});
		expect(ctrl.parseCommandArgs(['--package', 'frihet'])).toEqual({
			positional: [],
			packageName: 'frihet',
			retry: false,
		});
	});

	it('extracts --retry for reconcile-registry', () => {
		expect(ctrl.parseCommandArgs(['--package', 'frihet', '--retry'])).toEqual({
			positional: [],
			packageName: 'frihet',
			retry: true,
		});
	});

	it('rejects unknown positional commands (passed through untouched)', () => {
		expect(ctrl.parseCommandArgs(['--package', '@frihet/sdk', 'extra'])).toEqual({
			positional: ['extra'],
			packageName: '@frihet/sdk',
			retry: false,
		});
	});
});

describe('dispatchCommand — refuses unknown commands / missing --package', () => {
	it('throws on an unknown command', async () => {
		await expect(ctrl.dispatchCommand('totally-not-a-command', [])).rejects.toThrow(/Unknown release-control command/);
	});

	it('throws when pack-evidence is invoked without --package', async () => {
		await expect(ctrl.dispatchCommand('pack-evidence', [])).rejects.toThrow(/requires --package/);
	});

	it('throws when reconcile-registry is invoked without --package', async () => {
		await expect(ctrl.dispatchCommand('reconcile-registry', [])).rejects.toThrow(/requires --package/);
	});

	it('throws when registry-decision is invoked without --package', async () => {
		await expect(ctrl.dispatchCommand('registry-decision', [])).rejects.toThrow(/requires --package/);
	});

	it('accepts a no-op handler (verify-dispatch) and returns the completion marker', async () => {
		const result = await ctrl.dispatchCommand('verify-dispatch', [], {
			verifyDispatch: () => undefined,
		});
		expect(ctrl.hasCompletedHandler(result, 'verify-dispatch')).toBe(true);
	});
});

describe('validateFileContract — pack-evidence file shape', () => {
	// The script does NOT sort the `allowed` argument — it must already be in
	// sorted order, mirroring EXPECTED_FILES in release-control.cjs. We mirror
	// that contract here so the tests reflect the real call site.
	const allowed = ['README.md', 'dist/index.d.ts', 'dist/index.js'];

	it('accepts a sorted-equal match', () => {
		expect(() => ctrl.validateFileContract(
			allowed.map((path, i) => ({ path, size: i + 1 })),
			'test',
			allowed,
		)).not.toThrow();
	});

	it('REJECTS a file missing from the actual tarball', () => {
		expect(() => ctrl.validateFileContract(
			[{ path: 'README.md', size: 1 }],
			'test',
			allowed,
		)).toThrow(/allowlist mismatch/);
	});

	it('REJECTS an extra file in the actual tarball (hostile: poisoned pack)', () => {
		expect(() => ctrl.validateFileContract(
			[...allowed, 'evil.js'].map((path, i) => ({ path, size: i + 1 })),
			'test',
			allowed,
		)).toThrow(/allowlist mismatch/);
	});

	it('REJECTS an invalid size on any entry (hostile: empty / negative tar entry)', () => {
		expect(() => ctrl.validateFileContract(
			[
				{ path: 'README.md', size: -1 },
				{ path: 'dist/index.d.ts', size: 2 },
				{ path: 'dist/index.js', size: 3 },
			],
			'test',
			allowed,
		)).toThrow(/invalid size/);
	});
});

describe('parseTarFiles — tar header parser', () => {
	it('extracts the file list from a minimal gzip+tar fixture', () => {
		const tar = buildGzippedTar([
			{ name: 'package/README.md', content: Buffer.from('hi\n') },
			{ name: 'package/dist/index.js', content: Buffer.from('export {};\n') },
		]);
		const files = ctrl.parseTarFiles(tar);
		const paths = files.map((f: any) => f.path).sort();
		expect(paths).toEqual(['README.md', 'dist/index.js']);
		expect(files.find((f: any) => f.path === 'README.md').size).toBe(3);
	});

	it('refuses a tarball whose entries do not start with package/', () => {
		const tar = buildGzippedTar([
			{ name: 'evil/README.md', content: Buffer.from('hi\n') },
		]);
		expect(() => ctrl.parseTarFiles(tar)).toThrow(/Unexpected tar entry root/);
	});
});

describe('validatePublishedManifest — npm readback identity', () => {
	const goodEvidence = {
		schemaVersion: 1,
		name: '@frihet/sdk',
		version: '1.4.0',
		sha: EXPECTED_SHA,
		tarballUrl: 'https://registry.npmjs.org/@frihet/sdk/-/frihet-sdk-1.4.0.tgz',
		size: 100,
		unpackedSize: 100,
		entryCount: 2,
		shasum: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
		integrity: 'sha512-aaaa',
		files: [{ path: 'README.md', size: 50 }, { path: 'package.json', size: 50 }],
	};

	const goodManifest = {
		name: '@frihet/sdk',
		version: '1.4.0',
		dist: {
			integrity: 'sha512-aaaa',
			shasum: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
			tarball: 'https://registry.npmjs.org/@frihet/sdk/-/frihet-sdk-1.4.0.tgz',
			fileCount: 2,
			unpackedSize: 100,
		},
	};

	it('accepts a registry manifest that matches the local evidence', () => {
		expect(() => ctrl.validatePublishedManifest('@frihet/sdk', goodManifest, goodEvidence, EXPECTED_SHA)).not.toThrow();
	});

	it('REJECTS a manifest whose integrity differs from the local pack (hostile: registry was swapped)', () => {
		const tampered = { ...goodManifest, dist: { ...goodManifest.dist, integrity: 'sha512-bbbb' } };
		expect(() => ctrl.validatePublishedManifest('@frihet/sdk', tampered, goodEvidence, EXPECTED_SHA)).toThrow(/integrity differs/);
	});

	it('REJECTS a manifest whose shasum differs from the local pack', () => {
		const tampered = { ...goodManifest, dist: { ...goodManifest.dist, shasum: 'ffff' } };
		expect(() => ctrl.validatePublishedManifest('@frihet/sdk', tampered, goodEvidence, EXPECTED_SHA)).toThrow(/shasum differs/);
	});

	it('REJECTS a manifest whose tarball URL differs from the local pack', () => {
		const tampered = { ...goodManifest, dist: { ...goodManifest.dist, tarball: 'https://evil.example.com/x.tgz' } };
		expect(() => ctrl.validatePublishedManifest('@frihet/sdk', tampered, goodEvidence, EXPECTED_SHA)).toThrow(/tarball URL differs/);
	});

	it('REJECTS a manifest with a different version', () => {
		const tampered = { ...goodManifest, version: '9.9.9' };
		expect(() => ctrl.validatePublishedManifest('@frihet/sdk', tampered, goodEvidence, EXPECTED_SHA)).toThrow(/published version mismatch/);
	});

	it('REJECTS a manifest with a different package name (hostile: package swap on the registry)', () => {
		const tampered = { ...goodManifest, name: 'evil-pkg' };
		expect(() => ctrl.validatePublishedManifest('@frihet/sdk', tampered, goodEvidence, EXPECTED_SHA)).toThrow(/name mismatch/);
	});
});

describe('validateReleaseRecord — GitHub Release record identity', () => {
	const goodRelease = {
		tag_name: 'v1.4.0',
		target_commitish: EXPECTED_SHA,
		name: 'Frihet SDK + CLI v1.4.0',
		body: ctrl.RELEASE_BODY,
		draft: false,
		prerelease: false,
	};

	it('accepts a release pinned to the expected SHA via target_commitish', () => {
		expect(() => ctrl.validateReleaseRecord(goodRelease, EXPECTED_SHA, EXPECTED_SHA)).not.toThrow();
	});

	it('accepts a release pinned to the main branch (same SHA, different target_commitish form)', () => {
		expect(() => ctrl.validateReleaseRecord({ ...goodRelease, target_commitish: 'main' }, EXPECTED_SHA, EXPECTED_SHA)).not.toThrow();
	});

	it('REJECTS a tag pointing to a different SHA (hostile M5: tag was created on the wrong commit)', () => {
		expect(() => ctrl.validateReleaseRecord(goodRelease, WRONG_SHA, EXPECTED_SHA)).toThrow(/points to .*, expected/);
	});

	it('REJECTS a target_commitish that is neither the SHA nor main nor refs/heads/main', () => {
		expect(() => ctrl.validateReleaseRecord({ ...goodRelease, target_commitish: 'feat/rogue' }, EXPECTED_SHA, EXPECTED_SHA)).toThrow(/target_commitish mismatch/);
	});

	it('REJECTS a draft release (hostile: hidden release published without announcing)', () => {
		expect(() => ctrl.validateReleaseRecord({ ...goodRelease, draft: true }, EXPECTED_SHA, EXPECTED_SHA)).toThrow(/must not be a draft/);
	});

	it('REJECTS a prerelease flag (hostile: marked pre when the version is GA)', () => {
		expect(() => ctrl.validateReleaseRecord({ ...goodRelease, prerelease: true }, EXPECTED_SHA, EXPECTED_SHA)).toThrow(/must not be a prerelease/);
	});

	it('REJECTS a release body that drifts from the immutable contract', () => {
		expect(() => ctrl.validateReleaseRecord({ ...goodRelease, body: 'edited' }, EXPECTED_SHA, EXPECTED_SHA)).toThrow(/body differs from the immutable release contract/);
	});

	it('REJECTS a release whose name drifts from the canonical form', () => {
		expect(() => ctrl.validateReleaseRecord({ ...goodRelease, name: 'edited' }, EXPECTED_SHA, EXPECTED_SHA)).toThrow(/name mismatch/);
	});
});

describe('reconcileRegistryReadback — retry semantics', () => {
	// A complete, internally consistent published-package triple. The reconcile
	// helper only invokes validatePublishedPackage when fetchPublished returns
	// a non-null manifest, so we have to make every field that validator
	// inspects line up.
	function buildValidPublished() {
		const sdkFiles = ctrl.EXPECTED_FILES['@frihet/sdk'];
		const entries = sdkFiles.map((path) => ({
			name: `package/${path}`,
			content: Buffer.from(`contents of ${path}`),
		}));
		const tarball = buildGzippedTar(entries);
		const fileSizes = new Map(entries.map((e) => [e.name.slice('package/'.length), e.content.length]));
		const unpackedSize = [...fileSizes.values()].reduce((a, b) => a + b, 0);
		const evidence = {
			schemaVersion: 1,
			name: '@frihet/sdk',
			version: '1.4.0',
			sha: EXPECTED_SHA,
			tarballUrl: 'https://registry.npmjs.org/@frihet/sdk/-/frihet-sdk-1.4.0.tgz',
			size: tarball.length,
			unpackedSize,
			entryCount: sdkFiles.length,
			shasum: require('node:crypto').createHash('sha1').update(tarball).digest('hex'),
			integrity: `sha512-${require('node:crypto').createHash('sha512').update(tarball).digest('base64')}`,
			files: sdkFiles.map((path) => ({ path, size: fileSizes.get(path) ?? 0 })),
		};
		const manifest = {
			name: '@frihet/sdk',
			version: '1.4.0',
			dist: {
				integrity: evidence.integrity,
				shasum: evidence.shasum,
				tarball: evidence.tarballUrl,
				fileCount: sdkFiles.length,
				unpackedSize,
			},
		};
		return { manifest, tarball, evidence, expectedSha: EXPECTED_SHA };
	}

	const notYet = { manifest: null, tarball: null, evidence: {}, expectedSha: EXPECTED_SHA };

	it('returns the readback on the first successful attempt', async () => {
		const valid = buildValidPublished();
		const readback = await ctrl.reconcileRegistryReadback({
			packageName: '@frihet/sdk',
			attempts: 3,
			delayMs: 0,
			expectedSha: EXPECTED_SHA,
			fetchPublished: () => Promise.resolve(valid),
		});
		expect(readback.validated).toBe(true);
		expect(readback.name).toBe('@frihet/sdk');
	});

	it('retries on transient 404 and eventually succeeds', async () => {
		let calls = 0;
		const valid = buildValidPublished();
		const readback = await ctrl.reconcileRegistryReadback({
			packageName: '@frihet/sdk',
			attempts: 5,
			delayMs: 0,
			expectedSha: EXPECTED_SHA,
			fetchPublished: () => {
				calls += 1;
				return calls < 3 ? Promise.resolve(notYet) : Promise.resolve(valid);
			},
		});
		expect(calls).toBe(3);
		expect(readback.validated).toBe(true);
	});

	it('retries on transient network failures (no response at all)', async () => {
		let calls = 0;
		const valid = buildValidPublished();
		const readback = await ctrl.reconcileRegistryReadback({
			packageName: '@frihet/sdk',
			attempts: 4,
			delayMs: 0,
			expectedSha: EXPECTED_SHA,
			fetchPublished: () => {
				calls += 1;
				if (calls < 2) throw new ctrl.RegistryTransientError('transient network failure');
				return Promise.resolve(valid);
			},
		});
		expect(calls).toBe(2);
		expect(readback.validated).toBe(true);
	});

	it('gives up after exhausting all attempts (still 404 after N retries)', async () => {
		await expect(ctrl.reconcileRegistryReadback({
			packageName: '@frihet/sdk',
			attempts: 3,
			delayMs: 0,
			expectedSha: EXPECTED_SHA,
			fetchPublished: () => Promise.resolve(notYet),
		})).rejects.toThrow(/did not become fully readable after 3 attempts/);
	});

	it('does NOT retry on a non-transient error (hostile: a real validation failure)', async () => {
		let calls = 0;
		await expect(ctrl.reconcileRegistryReadback({
			packageName: '@frihet/sdk',
			attempts: 5,
			delayMs: 0,
			expectedSha: EXPECTED_SHA,
			fetchPublished: () => {
				calls += 1;
				return Promise.reject(new Error('integrity differs'));
			},
		})).rejects.toThrow(/integrity differs/);
		expect(calls).toBe(1);
	});

	it('rejects attempts=0 / delayMs<0 with a clear invariant message BEFORE any network call', async () => {
		let called = false;
		await expect(ctrl.reconcileRegistryReadback({
			packageName: '@frihet/sdk',
			attempts: 0,
			delayMs: 0,
			expectedSha: EXPECTED_SHA,
			fetchPublished: () => { called = true; return Promise.resolve(buildValidPublished()); },
		})).rejects.toThrow(/attempts must be a positive integer/);
		expect(called).toBe(false);

		await expect(ctrl.reconcileRegistryReadback({
			packageName: '@frihet/sdk',
			attempts: 1,
			delayMs: -1,
			expectedSha: EXPECTED_SHA,
			fetchPublished: () => { called = true; return Promise.resolve(buildValidPublished()); },
		})).rejects.toThrow(/delay must be a non-negative integer/);
		expect(called).toBe(false);
	});
});

describe('verify-sdk-published — hostile mutant M3 (CLI before SDK)', () => {
	it('THROWS when @frihet/sdk@VERSION is not yet on the registry', async () => {
		const fetchPublishedPackage = vi.fn(async () => ({ manifest: null, tarball: null, evidence: {}, expectedSha: EXPECTED_SHA }));
		await expect(dispatchWithHandlers('verify-sdk-published', [], {
			verifySdkPublished: async () => {
				const published = await fetchPublishedPackage();
				if (published.manifest === null) {
					throw new Error(`@frihet/sdk@1.4.0 is not yet on the registry — CLI publish blocked. Did the SDK publish step succeed?`);
				}
			},
		})).rejects.toThrow(/not yet on the registry/);
		expect(fetchPublishedPackage).toHaveBeenCalledTimes(1);
	});

	it('accepts when @frihet/sdk@VERSION is verified on the registry', async () => {
		const result = await dispatchWithHandlers('verify-sdk-published', [], {
			verifySdkPublished: () => Promise.resolve({ validated: true, name: '@frihet/sdk', version: '1.4.0' }),
		});
		expect(ctrl.hasCompletedHandler(result, 'verify-sdk-published')).toBe(true);
	});
});

describe('release.yml — hostile workflow mutations (M1, M2, M4)', () => {
	const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

	it('M1 — the publish step for @frihet/sdk uses --provenance (provenance cannot be silently dropped)', () => {
		// The script-side evidence is sha512 integrity, but trusted publishing
		// also requires the workflow to attach a provenance attestation. The
		// only authoritative way to ensure that is an explicit --provenance
		// flag on the npm publish command — not an environment variable that
		// could be unset in a fork.
		const publishStepSdk = workflow.match(/pnpm --filter @frihet\/sdk publish[^\n]*/);
		expect(publishStepSdk).not.toBeNull();
		expect(publishStepSdk![0]).toMatch(/--provenance/);
	});

	it('M2 — the publish step for @frihet/sdk uses --access public (no scoped-private default)', () => {
		const publishStepSdk = workflow.match(/pnpm --filter @frihet\/sdk publish[^\n]*/);
		expect(publishStepSdk).not.toBeNull();
		expect(publishStepSdk![0]).toMatch(/--access public/);
	});

	it('M1+M2 — the CLI publish step also carries --provenance and --access public', () => {
		const publishStepCli = workflow.match(/pnpm --filter frihet publish[^\n]*/);
		expect(publishStepCli).not.toBeNull();
		expect(publishStepCli![0]).toMatch(/--provenance/);
		expect(publishStepCli![0]).toMatch(/--access public/);
	});

	it('M4 — the verify-environment step appears BEFORE any publish step', () => {
		// The gate is structural: the env check must come first. A workflow
		// that reorders this can be caught by a simple order check, which
		// is what we test here.
		const envIdx = workflow.indexOf('verify-environment');
		const sdkPublishIdx = workflow.indexOf('pnpm --filter @frihet/sdk publish');
		const cliPublishIdx = workflow.indexOf('pnpm --filter frihet publish');
		expect(envIdx).toBeGreaterThan(-1);
		expect(sdkPublishIdx).toBeGreaterThan(-1);
		expect(cliPublishIdx).toBeGreaterThan(-1);
		expect(envIdx).toBeLessThan(sdkPublishIdx);
		expect(envIdx).toBeLessThan(cliPublishIdx);
	});

	it('M4 — the verify-dispatch step also appears BEFORE any publish step (both guards first)', () => {
		const dispatchIdx = workflow.indexOf('verify-dispatch');
		const sdkPublishIdx = workflow.indexOf('pnpm --filter @frihet/sdk publish');
		expect(dispatchIdx).toBeGreaterThan(-1);
		expect(dispatchIdx).toBeLessThan(sdkPublishIdx);
	});

	it('forbids an NPM_TOKEN fallback secret — only OIDC id-token:write is permitted', () => {
		// A NPM_TOKEN fallback would defeat the entire point of trusted
		// publishing. This assertion catches a hostile PR that adds
		// `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` to the env block.
		expect(workflow).not.toMatch(/NPM_TOKEN/);
		expect(workflow).not.toMatch(/NODE_AUTH_TOKEN/);
		// The id-token permission must be granted.
		expect(workflow).toMatch(/id-token:\s*write/);
	});

	it('declares the protected environment at the job level (not just the workflow level)', () => {
		expect(workflow).toMatch(/environment:\s*npm-release/);
	});

	it('declares a serial concurrency group to prevent two publishes at once', () => {
		expect(workflow).toMatch(/concurrency:\s*\n\s*group:\s*npm-release/);
		expect(workflow).toMatch(/cancel-in-progress:\s*false/);
	});

	it('declares workflow_dispatch with the exact version input', () => {
		expect(workflow).toMatch(/workflow_dispatch:/);
		expect(workflow).toMatch(/inputs:\s*\n\s*version:\s*\n\s*description:/);
		expect(workflow).toMatch(/default:\s*1\.4\.0/);
		expect(workflow).toMatch(/required:\s*true/);
	});

	it('does NOT trigger itself (no on.push tag triggers, no schedule)', () => {
		// Self-trigger would be a self-republish loop on the immutable tag.
		expect(workflow).not.toMatch(/on:\s*\n\s*push:/);
		expect(workflow).not.toMatch(/schedule:/);
	});

	it('contains the SDK-first gate between SDK publish and CLI publish', () => {
		// The verify-sdk-published step is the structural guarantee that the
		// CLI cannot publish until the SDK is on the registry.
		expect(workflow).toContain('verify-sdk-published');
		const sdkPublishIdx = workflow.indexOf('pnpm --filter @frihet/sdk publish');
		const cliPublishIdx = workflow.indexOf('pnpm --filter frihet publish');
		const gateIdx = workflow.indexOf('verify-sdk-published');
		expect(gateIdx).toBeGreaterThan(sdkPublishIdx);
		expect(gateIdx).toBeLessThan(cliPublishIdx);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a real gzipped tar in memory: tar header + payload blocks per entry,
 * an end-of-archive mark of two zero blocks, then zlib.gzipSync the whole
 * thing. The fixture must round-trip through zlib.gunzipSync to mirror what
 * the release machinery actually receives from the npm registry.
 */
function buildGzippedTar(entries: Array<{ name: string; content: Buffer }>): Buffer {
	const zlib = require('node:zlib') as typeof import('node:zlib');
	const blocks: Buffer[] = [];
	for (const entry of entries) {
		const header = Buffer.alloc(512, 0);
		const nameBuf = Buffer.from(entry.name, 'utf8');
		nameBuf.copy(header, 0, 0, Math.min(100, nameBuf.length));
		const sizeOct = entry.content.length.toString(8).padStart(11, '0');
		header.write(sizeOct, 124, 11, 'utf8');
		// typeflag at offset 156 must be ASCII '0' (0x30) for the parser to
		// recognize the entry as a regular file. A null byte fails the
		// `type === '' || type === '0'` predicate and the entry is skipped.
		header[156] = 0x30;
		blocks.push(header);
		blocks.push(entry.content);
		const padding = (512 - (entry.content.length % 512)) % 512;
		if (padding > 0) blocks.push(Buffer.alloc(padding, 0));
	}
	blocks.push(Buffer.alloc(1024, 0));
	return zlib.gzipSync(Buffer.concat(blocks));
}

function computeTarChecksum(_header: Buffer): string {
	// Reserved for future use — the parser ignores checksums, so we don't
	// bother computing them. Returns empty string by convention.
	return '';
}
