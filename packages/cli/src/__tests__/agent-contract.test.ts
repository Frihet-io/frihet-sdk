/**
 * Agent-facing CLI contract.
 *
 * An unattended caller cannot answer a prompt, so the failure path has to say
 * — in a form a machine can read — what went wrong and which recoveries work
 * without a TTY. These tests pin that, plus the two documentation claims that
 * were wrong before: the URL that issues an API key, and the fact that AGENTS.md
 * only names methods the SDK actually has.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const CLI_ROOT = resolve(REPO_ROOT, 'packages', 'cli');

/** /settings/api is the panel that issues keys. /settings/security is a real
 *  but different screen, which is why pointing at it went unnoticed. */
const KEY_URL = 'https://app.frihet.io/settings/api';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runGetApiKeyWithoutCredentials(): Promise<{
  exitCode: number | undefined;
  stderr: string[];
}> {
  const stderr: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  });

  let exitCode: number | undefined;
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    throw new Error('__exit__');
  }) as never);

  delete process.env['FRIHET_API_KEY'];
  // Point HOME at a directory with no ~/.frihet/config.json.
  const originalHome = process.env['HOME'];
  process.env['HOME'] = resolve(CLI_ROOT, 'no-such-home');

  const { getApiKey } = await import('../config.js');
  try {
    getApiKey();
  } catch (error) {
    if ((error as Error).message !== '__exit__') throw error;
  } finally {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
  }

  return { exitCode, stderr };
}

describe('missing-credential failure', () => {
  it('exits non-zero and emits a machine-readable error', async () => {
    const { exitCode, stderr } = await runGetApiKeyWithoutCredentials();

    expect(exitCode).toBe(1);

    const jsonLine = stderr.find(line => line.trimStart().startsWith('{'));
    expect(jsonLine, 'no JSON line on stderr — an agent has only prose to parse').toBeDefined();

    const payload = JSON.parse(jsonLine!) as {
      error: {
        code: string;
        obtainAt: string;
        recovery: { action: string; interactive: boolean }[];
      };
    };
    expect(payload.error.code).toBe('FRIHET_API_KEY_MISSING');
    expect(payload.error.obtainAt).toBe(KEY_URL);

    // The whole point: at least one recovery must work without a TTY.
    const nonInteractive = payload.error.recovery.filter(entry => !entry.interactive);
    expect(nonInteractive.length).toBeGreaterThan(0);
    expect(nonInteractive.map(entry => entry.action)).toContain('set_env');
  });

  it('tells a human where a key actually comes from', async () => {
    const { stderr } = await runGetApiKeyWithoutCredentials();
    expect(stderr.join('\n')).toContain(KEY_URL);
  });
});

describe('documented key URL is the one that issues keys', () => {
  it('no source or doc still points at /settings/security for key creation', () => {
    for (const file of ['packages/cli/src/config.ts', 'packages/sdk/src/client.ts', 'AGENTS.md', 'README.md']) {
      const contents = readFileSync(resolve(REPO_ROOT, file), 'utf8');
      // The full URL, not the bare path: config.ts and AGENTS.md deliberately
      // mention /settings/security in prose to explain why it is the wrong one.
      expect(contents, `${file} points at the wrong settings panel`).not.toMatch(
        /app\.frihet\.io\/settings\/security/
      );
    }
  });
});

describe('AGENTS.md names only methods that exist', () => {
  it('every frihet.<resource>.<method> in AGENTS.md is a real SDK method', async () => {
    const agents = readFileSync(resolve(REPO_ROOT, 'AGENTS.md'), 'utf8');
    const { Frihet } = await import('@frihet/sdk');
    const instance = new Frihet({ apiKey: 'fri_test' }) as unknown as Record<string, unknown>;

    // Only fully-qualified `frihet.<resource>.<method>` references. A looser
    // pattern picks up err.retryAfter and process.argv and asserts nothing.
    const mentioned = [...agents.matchAll(/`frihet\.([a-z]+)\.([a-zA-Z]+)`/g)].map(match => ({
      resource: match[1]!,
      method: match[2]!,
    }));
    expect(mentioned.length).toBeGreaterThan(5);

    const missing = mentioned.filter(({ resource, method }) => {
      const target = instance[resource] as Record<string, unknown> | undefined;
      return !target || typeof target[method] !== 'function';
    });
    expect(missing, `AGENTS.md names methods the SDK does not have: ${JSON.stringify(missing)}`).toEqual([]);
  });
});
