// Contract test runner for tests/contract/*.test.ts.
//
// Scoped to the contract test directory so it cannot accidentally pick up
// the SDK or CLI unit tests (those have their own per-package vitest configs).
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/contract/**/*.test.ts'],
		environment: 'node',
		testTimeout: 30_000,
		hookTimeout: 30_000,
		// The release-control validators are pure functions of their inputs
		// (env vars + files on disk). No fake timers, no concurrency tricks.
		pool: 'forks',
	},
});
