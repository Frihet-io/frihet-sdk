#!/usr/bin/env node

'use strict';

// Frihet SDK + CLI release control.
//
// Provenance: this script is the structural adaptation of
// ~/Documents/n8n-nodes-frihet/.github/scripts/release-control.cjs to a
// dual-package workspace (n8n ships one package; frihet-sdk ships two:
// @frihet/sdk AND frihet CLI). The single-package invariants that proved
// themselves in the n8n release (PR #15) carry over unchanged:
//
//   - verify-dispatch: repo/ref/SHA/worktree sanity.
//   - verify-environment: GitHub npm-release env policy.
//   - verify-metadata: exact version pinning at every layer that the
//     registry will not re-check.
//   - pack-evidence: tarball + manifest + integrity hashed from the
//     exact committed source, before anything leaves the runner.
//   - registry-decision: idempotency gate that prevents republish.
//   - reconcile-registry: final byte-equality readback with retry.
//   - reconcile-github-release: immutable tag + GitHub Release at the
//     SAME GITHUB_SHA.
//
// The dual-package additions are explicit and minimal:
//   - PACKAGE_NAMES ordered: SDK first, CLI second. The CLI's tarball
//     pins @frihet/sdk to an exact version at pack time, so the CLI
//     literally cannot publish first without breaking CLI installers.
//     We enforce that here too with verify-sdk-published.
//   - Per-package EVIDENCE/READBACK artifacts, so the two packs can be
//     reconciled independently.
//   - finalize-pins: appends the released commit to scripts/publish-pins.json
//     so scripts/check-publish-drift.mjs (the byte-reproducibility gate)
//     can rebuild THIS commit and assert byte-equality to the tarballs.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync, spawnSync } = require('child_process');

const PACKAGE_NAMES = Object.freeze(['@frihet/sdk', 'frihet']);
const PACKAGE_DIRS = Object.freeze({
	'@frihet/sdk': 'packages/sdk',
	'frihet': 'packages/cli',
});
const VERSION = '1.4.0';
const TAG = `v${VERSION}`;
const REPOSITORY = 'Frihet-io/frihet-sdk';
const MAIN_BRANCH = 'main';
const MAIN_REF = `refs/heads/${MAIN_BRANCH}`;
const ENVIRONMENT = 'npm-release';
const NODE_VERSION = 'v24.20.0';
const NPM_VERSION = '11.19.0'; // Node 24.20.0 LTS bundles npm 11.19.0; trusted publishing requires >=11.5.1
const REGISTRY = 'https://registry.npmjs.org';
const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const PINS_FILE = 'scripts/publish-pins.json';
const REGISTRY_REQUEST_TIMEOUT_MS = 10_000;
const REGISTRY_RETRY_ATTEMPTS = 12;
const REGISTRY_RETRY_DELAY_MS = 10_000;
const RELEASE_NAME = `Frihet SDK + CLI v${VERSION}`;
const RELEASE_BODY = [
	`Immutable release for @frihet/sdk@${VERSION} AND frihet@${VERSION}.`,
	'',
	'Both npm tarballs, both registry manifests, the immutable Git tag, and this GitHub Release were reconciled by the protected release workflow against the same main commit. SDK published first so the CLI tarball can pin @frihet/sdk@VERSION to a version that actually exists.',
].join('\n');

const SDK_EXPECTED_FILES = Object.freeze(sorted([
	'README.md',
	'CHANGELOG.md',
	'LICENSE',
	'package.json',
	'dist/index.cjs',
	'dist/index.cjs.map',
	'dist/index.js',
	'dist/index.js.map',
	'dist/index.d.cts',
	'dist/index.d.cts.map',
	'dist/index.d.ts',
	'dist/index.d.ts.map',
]));

const CLI_EXPECTED_FILES = Object.freeze(sorted([
	'README.md',
	'CHANGELOG.md',
	'LICENSE',
	'package.json',
	'dist/index.js',
	'dist/index.js.map',
	'dist/index.d.ts',
	'dist/index.d.ts.map',
]));

const EXPECTED_FILES = Object.freeze({
	'@frihet/sdk': SDK_EXPECTED_FILES,
	'frihet': CLI_EXPECTED_FILES,
});

const EVIDENCE_PREFIX = 'npm-pack-evidence';
const READBACK_PREFIX = 'npm-readback';

function evidenceName(pkg) {
	return `${EVIDENCE_PREFIX}-${pkg.replace(/[^a-z0-9]+/gi, '-')}.json`;
}

function readbackName(pkg) {
	return `${READBACK_PREFIX}-${pkg.replace(/[^a-z0-9]+/gi, '-')}.json`;
}

function invariant(condition, message) {
	if (!condition) throw new Error(message);
}

class RegistryTransientError extends Error {
	constructor(message, cause) {
		super(message, { cause });
		this.name = 'RegistryTransientError';
	}
}

function isTransientRegistryStatus(status) {
	return status === 404 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function sorted(values) {
	return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function sha1(buffer) {
	return crypto.createHash('sha1').update(buffer).digest('hex');
}

function integrity(buffer) {
	return `sha512-${crypto.createHash('sha512').update(buffer).digest('base64')}`;
}

function parseTarSize(header) {
	const value = header.toString('utf8').replace(/\0.*$/s, '').trim();
	return value === '' ? 0 : Number.parseInt(value, 8);
}

function parseTarFiles(tarball) {
	const archive = zlib.gunzipSync(tarball);
	const files = [];
	let offset = 0;

	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;

		const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
		const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
		const fullName = prefix ? `${prefix}/${name}` : name;
		const size = parseTarSize(header.subarray(124, 136));
		const type = header.subarray(156, 157).toString('utf8');

		if (type === '' || type === '0') {
			invariant(fullName.startsWith('package/'), `Unexpected tar entry root: ${fullName}`);
			files.push({ path: fullName.slice('package/'.length), size });
		}

		offset += 512 + Math.ceil(size / 512) * 512;
	}

	return files;
}

function validateFileContract(files, label, allowed) {
	const paths = sorted(files.map((entry) => entry.path));
	invariant(
		JSON.stringify(paths) === JSON.stringify(allowed),
		`${label} file allowlist mismatch.\n  expected: ${JSON.stringify(allowed)}\n  actual:   ${JSON.stringify(paths)}`,
	);
	for (const entry of files) {
		invariant(Number.isInteger(entry.size) && entry.size >= 0, `${label} has invalid size for ${entry.path}`);
	}
}

function expectedTarballFilename(packageName) {
	// npm convention: a scoped package `@scope/name` produces a tarball file
	// `scope-name-VERSION.tgz` (the slash in the scope becomes a dash, AND a
	// second leading dash is added to avoid directory traversal). For unscoped
	// `frihet`, the file is just `frihet-VERSION.tgz`.
	return packageName === '@frihet/sdk' ? `frihet-sdk-${VERSION}.tgz` : `${packageName}-${VERSION}.tgz`;
}

function buildPackEvidence(packageName, pack, tarball, sha) {
	invariant(pack && typeof pack === 'object', 'npm pack returned no report');
	invariant(pack.name === packageName, `Unexpected pack name: ${pack.name} (expected ${packageName})`);
	invariant(pack.version === VERSION, `Unexpected pack version: ${pack.version}`);
	const expectedTarball = expectedTarballFilename(packageName);
	invariant(pack.filename === expectedTarball, `Unexpected tarball filename: ${pack.filename} (expected ${expectedTarball})`);

	const allowed = EXPECTED_FILES[packageName];
	invariant(pack.entryCount === allowed.length, `Unexpected pack entry count for ${packageName}: ${pack.entryCount}`);
	invariant(pack.files.length === allowed.length, `Unexpected pack files length for ${packageName}: ${pack.files.length}`);
	validateFileContract(pack.files, `${packageName} npm pack report`, allowed);

	const tarFiles = parseTarFiles(tarball);
	validateFileContract(tarFiles, `${packageName} local tarball`, allowed);
	const reportSizes = new Map(pack.files.map((entry) => [entry.path, entry.size]));
	for (const entry of tarFiles) {
		invariant(reportSizes.get(entry.path) === entry.size, `${packageName} local tar size mismatch for ${entry.path}`);
	}

	const unpackedSize = pack.files.reduce((total, entry) => total + entry.size, 0);
	invariant(pack.unpackedSize === unpackedSize, `${packageName} npm pack unpackedSize does not equal file-size sum`);
	invariant(pack.size === tarball.length, `${packageName} npm pack size does not equal tarball byte length`);
	invariant(pack.shasum === sha1(tarball), `${packageName} npm pack shasum does not match tarball bytes`);
	invariant(pack.integrity === integrity(tarball), `${packageName} npm pack integrity does not match tarball bytes`);

	return {
		schemaVersion: 1,
		name: packageName,
		version: VERSION,
		sha,
		tarballUrl: `${REGISTRY}/${packageName}/-/${packageName.replace('@', '').replace('/', '-')}-${VERSION}.tgz`.replace('@-', ''),
		size: pack.size,
		unpackedSize: pack.unpackedSize,
		entryCount: pack.entryCount,
		shasum: pack.shasum,
		integrity: pack.integrity,
		files: pack.files
			.map((entry) => ({ path: entry.path, size: entry.size }))
			.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
	};
}

function validatePublishedManifest(packageName, manifest, evidence, expectedSha) {
	invariant(manifest && typeof manifest === 'object', `${packageName} npm manifest is missing`);
	invariant(evidence.sha === expectedSha, `${packageName} local pack evidence SHA does not match GITHUB_SHA`);
	invariant(manifest.name === packageName, `${packageName} published package name mismatch: ${manifest.name}`);
	invariant(manifest.version === VERSION, `${packageName} published version mismatch: ${manifest.version}`);
	invariant(manifest.dist?.integrity === evidence.integrity, `${packageName} published integrity differs from expected pack`);
	invariant(manifest.dist?.shasum === evidence.shasum, `${packageName} published shasum differs from expected pack`);
	invariant(manifest.dist?.tarball === evidence.tarballUrl, `${packageName} published tarball URL differs from expected pack`);
	invariant(manifest.dist?.fileCount === evidence.entryCount, `${packageName} published file count differs from expected pack`);
	invariant(manifest.dist?.unpackedSize === evidence.unpackedSize, `${packageName} published unpacked size differs from expected pack`);
	return true;
}

function validatePublishedPackage(packageName, manifest, tarball, evidence, expectedSha) {
	validatePublishedManifest(packageName, manifest, evidence, expectedSha);
	invariant(tarball.length === evidence.size, `${packageName} downloaded tarball byte length differs from expected pack`);
	invariant(sha1(tarball) === evidence.shasum, `${packageName} downloaded tarball shasum differs from expected pack`);
	invariant(integrity(tarball) === evidence.integrity, `${packageName} downloaded tarball integrity differs from expected pack`);

	const remoteFiles = parseTarFiles(tarball);
	validateFileContract(remoteFiles, `${packageName} downloaded npm tarball`, EXPECTED_FILES[packageName]);
	const expectedSizes = new Map(evidence.files.map((entry) => [entry.path, entry.size]));
	for (const entry of remoteFiles) {
		invariant(expectedSizes.get(entry.path) === entry.size, `${packageName} downloaded tar size mismatch for ${entry.path}`);
	}

	// SDK-first enforcement: if this is the CLI, its published tarball MUST pin
	// @frihet/sdk to an exact version. pnpm rewrites workspace:* at pack time.
	if (packageName === 'frihet') {
		const cliPkg = readPackageJson('packages/cli/package.json');
		const publishedCliDep = manifest.dependencies?.['@frihet/sdk'];
		invariant(
			publishedCliDep === VERSION,
			`CLI published tarball must pin @frihet/sdk@${VERSION} (workspace:* rewriting), got: ${publishedCliDep}`,
		);
		// Source-state check: the source package.json must still be workspace:*
		// (the rewrite only happens at publish time, never in source).
		invariant(
			cliPkg.dependencies?.['@frihet/sdk'] === 'workspace:*',
			`CLI source package.json must declare @frihet/sdk as workspace:* (got ${cliPkg.dependencies?.['@frihet/sdk']})`,
		);
	}

	return {
		validated: true,
		name: packageName,
		version: manifest.version,
		integrity: manifest.dist.integrity,
		shasum: manifest.dist.shasum,
		tarball: manifest.dist.tarball,
		fileCount: manifest.dist.fileCount,
		unpackedSize: manifest.dist.unpackedSize,
		size: tarball.length,
	};
}

function decideRegistryAction(published, packageName) {
	if (published === null) return { exists: false, shouldPublish: true, readback: null };
	const readback = validatePublishedPackage(packageName, published.manifest, published.tarball, published.evidence, published.expectedSha);
	return { exists: true, shouldPublish: false, readback };
}

function validateEnvironmentPolicy(environment) {
	invariant(environment && typeof environment === 'object', 'GitHub environment response is missing');
	const reviewers = (environment.protection_rules ?? []).find((rule) => rule.type === 'required_reviewers');
	invariant(reviewers && Array.isArray(reviewers.reviewers) && reviewers.reviewers.length > 0, 'npm-release must require at least one reviewer');
	invariant(reviewers.prevent_self_review === true, 'npm-release must prevent self-review');
	invariant(environment.deployment_branch_policy?.protected_branches === true, 'npm-release must allow protected branches only');
	invariant(environment.can_admins_bypass === false, 'npm-release must disallow administrator bypass');
	return true;
}

function validateReleaseRecord(release, tagTarget, expectedSha) {
	invariant(tagTarget === expectedSha, `Tag ${TAG} points to ${tagTarget}, expected ${expectedSha}`);
	invariant(release && typeof release === 'object', 'GitHub Release is missing');
	invariant(release.tag_name === TAG, `GitHub Release tag mismatch: ${release.tag_name}`);
	invariant(
		[expectedSha, MAIN_BRANCH, MAIN_REF].includes(release.target_commitish),
		`GitHub Release target_commitish mismatch: ${release.target_commitish}`,
	);
	invariant(release.name === RELEASE_NAME, `GitHub Release name mismatch: ${release.name}`);
	invariant(release.body === RELEASE_BODY, 'GitHub Release body differs from the immutable release contract');
	invariant(release.draft === false, 'GitHub Release must not be a draft');
	invariant(release.prerelease === false, 'GitHub Release must not be a prerelease');
	return true;
}

function runnerFile(name) {
	const directory = process.env.RUNNER_TEMP;
	invariant(directory, 'RUNNER_TEMP is required');
	return path.join(directory, name);
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
	fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function git(...args) {
	return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitOrEmpty(...args) {
	try {
		return git(...args);
	} catch (_error) {
		return '';
	}
}

function readPackageJson(relativePath) {
	return readJson(path.resolve(relativePath));
}

function resolvePackage(name) {
	invariant(PACKAGE_NAMES.includes(name), `Unknown package: ${name}. Expected one of: ${PACKAGE_NAMES.join(', ')}`);
	return name;
}

function packageDir(name) {
	return PACKAGE_DIRS[name];
}

function validateDispatchContext(context) {
	invariant(context.repository === REPOSITORY, `Unexpected repository: ${context.repository}`);
	invariant(context.ref === MAIN_REF, `Release must run from main, got ${context.ref}`);
	invariant(context.inputVersion === VERSION, `Release input must be ${VERSION}, got ${context.inputVersion}`);
	invariant(context.sha === context.head, 'Checked-out HEAD differs from GITHUB_SHA');
	invariant(context.status === '', 'Release worktree is dirty');
	invariant(context.trackedNodeModules === '', 'node_modules is tracked');
	return true;
}

function assertDispatch() {
	validateDispatchContext({
		repository: process.env.GITHUB_REPOSITORY,
		ref: process.env.GITHUB_REF,
		inputVersion: process.env.INPUT_VERSION,
		sha: process.env.GITHUB_SHA,
		head: git('rev-parse', 'HEAD'),
		status: git('status', '--porcelain=v1'),
		trackedNodeModules: git('ls-files', 'node_modules'),
	});
}

function validateMetadataContract(metadata) {
	invariant(metadata.inputVersion === VERSION, `Release input must be ${VERSION}`);
	invariant(metadata.sdkPackageJson.version === VERSION, `packages/sdk/package.json version must be ${VERSION}, got ${metadata.sdkPackageJson.version}`);
	invariant(metadata.cliPackageJson.version === VERSION, `packages/cli/package.json version must be ${VERSION}, got ${metadata.cliPackageJson.version}`);
	invariant(metadata.sdkPackageJson.name === '@frihet/sdk', `packages/sdk/package.json name must be @frihet/sdk, got ${metadata.sdkPackageJson.name}`);
	invariant(metadata.cliPackageJson.name === 'frihet', `packages/cli/package.json name must be frihet, got ${metadata.cliPackageJson.name}`);
	// CLI depends on @frihet/sdk via workspace:* at source; pnpm rewrites to
	// an exact version at pack time. The source MUST still be workspace:*.
	invariant(
		metadata.cliPackageJson.dependencies?.['@frihet/sdk'] === 'workspace:*',
		`packages/cli/package.json must depend on @frihet/sdk via workspace:*, got ${metadata.cliPackageJson.dependencies?.['@frihet/sdk']}`,
	);
	invariant(metadata.lockfileHasSdkImporter, 'pnpm-lock.yaml must contain a `packages/sdk:` importer block');
	invariant(metadata.lockfileHasCliImporter, 'pnpm-lock.yaml must contain a `packages/cli:` importer block');
	invariant(metadata.nodeVersion === NODE_VERSION, `Release Node must be ${NODE_VERSION}, got ${metadata.nodeVersion}`);
	invariant(metadata.npmVersion === NPM_VERSION, `Release npm must be ${NPM_VERSION}, got ${metadata.npmVersion}`);
	return true;
}

function assertMetadata() {
	const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
	const lockfile = fs.readFileSync('pnpm-lock.yaml', 'utf8');
	validateMetadataContract({
		inputVersion: process.env.INPUT_VERSION,
		sdkPackageJson: readPackageJson('packages/sdk/package.json'),
		cliPackageJson: readPackageJson('packages/cli/package.json'),
		lockfileHasSdkImporter: /^  packages\/sdk:/m.test(lockfile),
		lockfileHasCliImporter: /^  packages\/cli:/m.test(lockfile),
		nodeVersion: process.version,
		npmVersion,
	});
}

async function request(url, options = {}) {
	const response = await fetch(url, {
		...options,
		headers: {
			Accept: 'application/vnd.github+json',
			'Cache-Control': 'no-cache',
			...(options.headers ?? {}),
		},
	});
	return response;
}

async function registryRequest(url, options, label, requestImpl = request) {
	try {
		return await requestImpl(url, {
			...options,
			signal: options?.signal ?? AbortSignal.timeout(REGISTRY_REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		throw new RegistryTransientError(`${label} network failure: ${error.message}`, error);
	}
}

function rejectTransientRegistryStatus(response, label) {
	if (isTransientRegistryStatus(response.status)) {
		throw new RegistryTransientError(`${label} is transiently unavailable (${response.status})`);
	}
}

async function readRegistryBody(response, method, label) {
	try {
		return await response[method]();
	} catch (error) {
		throw new RegistryTransientError(`${label} body read failed: ${error.message}`, error);
	}
}

async function registryResponseJson(response, label) {
	const body = await readRegistryBody(response, 'text', label);
	if (!response.ok) throw new Error(`${label} failed (${response.status}): ${body.slice(0, 500)}`);
	try {
		return JSON.parse(body);
	} catch (error) {
		throw new RegistryTransientError(`${label} returned incomplete or invalid JSON: ${error.message}`, error);
	}
}

async function responseJson(response, label) {
	const text = await response.text();
	if (!response.ok) throw new Error(`${label} failed (${response.status}): ${text.slice(0, 500)}`);
	return JSON.parse(text);
}

async function verifyEnvironment() {
	const token = process.env.GITHUB_TOKEN;
	invariant(token, 'GITHUB_TOKEN is required');
	const response = await request(`${GITHUB_API}/repos/${REPOSITORY}/environments/${ENVIRONMENT}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': API_VERSION,
		},
	});
	const environment = await responseJson(response, 'Environment readback');
	validateEnvironmentPolicy(environment);
}

function createPackEvidence(packageName) {
	resolvePackage(packageName);
	const cwd = packageDir(packageName);
	const output = execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { encoding: 'utf8', cwd });
	const pack = JSON.parse(output)[0];
	const tarballPath = path.resolve(cwd, pack.filename);
	try {
		const tarball = fs.readFileSync(tarballPath);
		const evidence = buildPackEvidence(packageName, pack, tarball, process.env.GITHUB_SHA);
		writeJson(runnerFile(evidenceName(packageName)), evidence);
		return evidence;
	} finally {
		if (fs.existsSync(tarballPath)) fs.unlinkSync(tarballPath);
	}
}

async function fetchPublishedPackage(packageName, expectedSha, requestImpl = request) {
	const evidenceFile = runnerFile(evidenceName(packageName));
	invariant(fs.existsSync(evidenceFile), `${packageName} pack-evidence must exist before registry readback (run pack-evidence first)`);
	const evidence = readJson(evidenceFile);

	const manifestResponse = await registryRequest(`${REGISTRY}/${packageName}/${VERSION}`, {
		headers: { Accept: 'application/json' },
	}, `${packageName} npm manifest readback`, requestImpl);
	if (manifestResponse.status === 404) return { manifest: null, tarball: null, evidence, expectedSha };
	rejectTransientRegistryStatus(manifestResponse, `${packageName} npm manifest readback`);
	const manifest = await registryResponseJson(manifestResponse, `${packageName} npm manifest readback`);
	validatePublishedManifest(packageName, manifest, evidence, expectedSha);

	const tarballResponse = await registryRequest(
		manifest.dist.tarball,
		{ headers: { Accept: 'application/octet-stream' } },
		`${packageName} npm tarball readback`,
		requestImpl,
	);
	rejectTransientRegistryStatus(tarballResponse, `${packageName} npm tarball readback`);
	if (!tarballResponse.ok) {
		const body = await readRegistryBody(tarballResponse, 'text', `${packageName} npm tarball readback`);
		throw new Error(`${packageName} npm tarball readback failed (${tarballResponse.status}): ${body.slice(0, 500)}`);
	}
	const tarball = await readRegistryBody(tarballResponse, 'arrayBuffer', `${packageName} npm tarball readback`);
	return { manifest, tarball: Buffer.from(tarball), evidence, expectedSha };
}

function appendOutput(name, value) {
	invariant(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required');
	fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function registryDecision(packageName) {
	resolvePackage(packageName);
	const evidence = readJson(runnerFile(evidenceName(packageName)));
	const published = await fetchPublishedPackage(packageName, process.env.GITHUB_SHA);
	if (published.manifest === null) {
		appendOutput('exists', 'false');
		return { exists: false, shouldPublish: true, readback: null };
	}
	const readback = validatePublishedPackage(packageName, published.manifest, published.tarball, published.evidence, published.expectedSha);
	writeJson(runnerFile(readbackName(packageName)), readback);
	appendOutput('exists', 'true');
	return { exists: true, shouldPublish: false, readback };
}

async function reconcileRegistryReadback({
	packageName,
	attempts,
	delayMs,
	expectedSha,
	fetchPublished,
	sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
	resolvePackage(packageName);
	invariant(Number.isInteger(attempts) && attempts > 0, 'Registry retry attempts must be a positive integer');
	invariant(Number.isInteger(delayMs) && delayMs >= 0, 'Registry retry delay must be a non-negative integer');
	let lastTransient;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const published = await fetchPublished();
			if (published.manifest === null) {
				throw new RegistryTransientError(`${packageName}@${VERSION} manifest is not readable yet (404)`);
			}
			return validatePublishedPackage(packageName, published.manifest, published.tarball, published.evidence, published.expectedSha);
		} catch (error) {
			if (!(error instanceof RegistryTransientError)) throw error;
			lastTransient = error;
		}
		if (attempt < attempts) await sleep(delayMs);
	}
	throw new Error(
		`${packageName}@${VERSION} did not become fully readable after ${attempts} attempts: ${lastTransient.message}`,
		{ cause: lastTransient },
	);
}

async function reconcileRegistry(packageName, retry) {
	resolvePackage(packageName);
	const evidence = readJson(runnerFile(evidenceName(packageName)));
	const readback = await reconcileRegistryReadback({
		packageName,
		attempts: retry ? REGISTRY_RETRY_ATTEMPTS : 1,
		delayMs: retry ? REGISTRY_RETRY_DELAY_MS : 0,
		expectedSha: process.env.GITHUB_SHA,
		fetchPublished: () => fetchPublishedPackage(packageName, process.env.GITHUB_SHA),
	});
	writeJson(runnerFile(readbackName(packageName)), readback);
	return readback;
}

async function verifySdkPublished() {
	// Hard gate between the SDK publish step and the CLI publish step.
	// After the SDK step, @frihet/sdk@VERSION MUST be on the registry.
	const published = await fetchPublishedPackage('@frihet/sdk', process.env.GITHUB_SHA);
	invariant(
		published.manifest !== null,
		`@frihet/sdk@${VERSION} is not yet on the registry — CLI publish blocked. Did the SDK publish step succeed?`,
	);
	const readback = validatePublishedPackage('@frihet/sdk', published.manifest, published.tarball, published.evidence, published.expectedSha);
	writeJson(runnerFile(readbackName('@frihet/sdk')), readback);
	return readback;
}

function githubHeaders() {
	const token = process.env.GITHUB_TOKEN;
	invariant(token, 'GITHUB_TOKEN is required');
	return {
		Authorization: `Bearer ${token}`,
		'X-GitHub-Api-Version': API_VERSION,
		'Content-Type': 'application/json',
	};
}

async function githubJson(method, pathname, body, allowedStatuses = [200]) {
	const response = await request(`${GITHUB_API}/repos/${REPOSITORY}${pathname}`, {
		method,
		headers: githubHeaders(),
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (allowedStatuses.includes(response.status)) {
		return { status: response.status, data: response.status === 204 ? null : JSON.parse(await response.text()) };
	}
	const text = await response.text();
	throw new Error(`GitHub ${method} ${pathname} failed (${response.status}): ${text.slice(0, 500)}`);
}

async function readTagTarget() {
	const ref = await githubJson('GET', `/git/ref/tags/${encodeURIComponent(TAG)}`, undefined, [200, 404]);
	if (ref.status === 404) return null;
	let object = ref.data.object;
	for (let depth = 0; depth < 8; depth += 1) {
		if (object.type === 'commit') return object.sha;
		invariant(object.type === 'tag', `Unsupported Git tag object type: ${object.type}`);
		const annotated = await githubJson('GET', `/git/tags/${object.sha}`);
		object = annotated.data.object;
	}
	throw new Error('Annotated tag chain exceeds maximum depth');
}

async function ensureTag(expectedSha) {
	let target = await readTagTarget();
	if (target === null) {
		try {
			await githubJson('POST', '/git/refs', { ref: `refs/tags/${TAG}`, sha: expectedSha }, [201]);
		} catch (error) {
			// A concurrent retry may have created the immutable tag. Verify it below.
			if (!String(error.message).includes('(422)')) throw error;
		}
		target = await readTagTarget();
	}
	invariant(target === expectedSha, `Tag ${TAG} points to ${target}, expected ${expectedSha}`);
	return target;
}

async function readRelease() {
	const release = await githubJson('GET', `/releases/tags/${encodeURIComponent(TAG)}`, undefined, [200, 404]);
	return release.status === 404 ? null : release.data;
}

async function ensureRelease(expectedSha) {
	const target = await ensureTag(expectedSha);
	let release = await readRelease();
	if (release === null) {
		try {
			await githubJson('POST', '/releases', {
				tag_name: TAG,
				target_commitish: expectedSha,
				name: RELEASE_NAME,
				body: RELEASE_BODY,
				draft: false,
				prerelease: false,
				generate_release_notes: false,
			}, [201]);
		} catch (error) {
			// A concurrent retry may have created the immutable release. Verify it below.
			if (!String(error.message).includes('(422)')) throw error;
		}
		release = await readRelease();
	}
	validateReleaseRecord(release, target, expectedSha);
	return release;
}

async function reconcileGitHubRelease() {
	// Both packages must have a validated readback before the GitHub Release is created.
	const sdkReadback = readJson(runnerFile(readbackName('@frihet/sdk')));
	const cliReadback = readJson(runnerFile(readbackName('frihet')));
	invariant(sdkReadback.validated === true, 'Validated @frihet/sdk readback is required before GitHub release');
	invariant(cliReadback.validated === true, 'Validated frihet readback is required before GitHub release');
	invariant(sdkReadback.version === VERSION, `SDK readback version must be ${VERSION}, got ${sdkReadback.version}`);
	invariant(cliReadback.version === VERSION, `CLI readback version must be ${VERSION}, got ${cliReadback.version}`);
	return ensureRelease(process.env.GITHUB_SHA);
}

function finalizePins() {
	// Append (or update) the 1.4.0 entry in scripts/publish-pins.json so the
	// byte-reproducibility gate can rebuild THIS commit and assert it matches
	// the published tarballs.
	const sha = process.env.GITHUB_SHA;
	const pins = readJson(PINS_FILE);
	invariant(Array.isArray(pins.pins), 'scripts/publish-pins.json must have a pins array');

	const today = new Date().toISOString().slice(0, 10);
	const note = `release(sdk): ${VERSION} to npm — verified ${today}: rebuild matches both published tarballs byte-for-byte`;

	const existingIndex = pins.pins.findIndex((pin) => pin.packages?.['@frihet/sdk'] === VERSION && pin.packages?.['frihet'] === VERSION);
	const entry = { commit: sha, note, packages: { '@frihet/sdk': VERSION, frihet: VERSION } };
	if (existingIndex >= 0) {
		pins.pins[existingIndex] = entry;
	} else {
		pins.pins.unshift(entry);
	}
	writeJson(PINS_FILE, pins);
	return { count: pins.pins.length, top: pins.pins[0] };
}

const HANDLER_COMPLETION = Symbol('release-control-handler-completion');

const DEFAULT_COMMAND_HANDLERS = Object.freeze({
	verifyDispatch: assertDispatch,
	verifyEnvironment,
	verifyMetadata: assertMetadata,
	verifySdkPublished,
	packEvidence: (packageName) => createPackEvidence(packageName),
	registryDecision: (packageName) => registryDecision(packageName),
	reconcileRegistry: (packageName, retry) => reconcileRegistry(packageName, retry),
	reconcileGitHubRelease,
	finalizePins,
	dispatchSelftest: () => undefined,
	selftest: () => undefined,
});

function parseCommandArgs(args) {
	// Each command accepts optional --package <name> positional. For
	// reconcile-registry, also accepts --retry as a flag.
	const positional = [];
	let packageName = null;
	let retry = false;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === '--package') {
			i += 1;
			packageName = args[i];
		} else if (arg === '--retry') {
			retry = true;
		} else {
			positional.push(arg);
		}
	}
	return { positional, packageName, retry };
}

async function dispatchCommand(command, args = [], handlers = DEFAULT_COMMAND_HANDLERS) {
	const { packageName, retry } = parseCommandArgs(args);
	switch (command) {
		case 'verify-dispatch':
			await handlers.verifyDispatch();
			break;
		case 'verify-environment':
			await handlers.verifyEnvironment();
			break;
		case 'verify-metadata':
			await handlers.verifyMetadata();
			break;
		case 'verify-sdk-published':
			await handlers.verifySdkPublished();
			break;
		case 'pack-evidence':
			invariant(packageName, 'pack-evidence requires --package <name>');
			await handlers.packEvidence(packageName);
			break;
		case 'registry-decision':
			invariant(packageName, 'registry-decision requires --package <name>');
			await handlers.registryDecision(packageName);
			break;
		case 'reconcile-registry':
			invariant(packageName, 'reconcile-registry requires --package <name>');
			await handlers.reconcileRegistry(packageName, retry);
			break;
		case 'reconcile-github-release':
			await handlers.reconcileGitHubRelease();
			break;
		case 'finalize-pins':
			await handlers.finalizePins();
			break;
		case 'dispatch-selftest':
			await handlers.dispatchSelftest();
			break;
		case 'selftest':
			await handlers.selftest();
			break;
		default:
			throw new Error(`Unknown release-control command: ${command ?? '<missing>'}`);
	}
	return { command, completion: HANDLER_COMPLETION };
}

function hasCompletedHandler(result, command) {
	return Boolean(
		result &&
		typeof result === 'object' &&
		result.command === command &&
		result.completion === HANDLER_COMPLETION,
	);
}

async function main() {
	const [command, ...args] = process.argv.slice(2);
	return dispatchCommand(command, args);
}

function cliSuccessMarker(command) {
	return `release-control:${command}:ok`;
}

module.exports = {
	ENVIRONMENT,
	EXPECTED_FILES,
	GITHUB_API,
	MAIN_BRANCH,
	MAIN_REF,
	NPM_VERSION,
	NODE_VERSION,
	PACKAGE_NAMES,
	PACKAGE_DIRS,
	REGISTRY,
	REGISTRY_REQUEST_TIMEOUT_MS,
	REGISTRY_RETRY_ATTEMPTS,
	REGISTRY_RETRY_DELAY_MS,
	RegistryTransientError,
	RELEASE_BODY,
	RELEASE_NAME,
	REPOSITORY,
	TAG,
	VERSION,
	buildPackEvidence,
	cliSuccessMarker,
	decideRegistryAction,
	dispatchCommand,
	fetchPublishedPackage,
	hasCompletedHandler,
	isTransientRegistryStatus,
	parseCommandArgs,
	parseTarFiles,
	reconcileRegistryReadback,
	validateDispatchContext,
	validateEnvironmentPolicy,
	validateFileContract,
	validateMetadataContract,
	validatePublishedManifest,
	validatePublishedPackage,
	validateReleaseRecord,
};

if (require.main === module) {
	main()
		.then((result) => {
			invariant(hasCompletedHandler(result, result?.command), 'Release-control command handler did not complete');
			console.log(cliSuccessMarker(result.command));
		})
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}
