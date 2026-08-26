import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.frihet');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface Config {
  apiKey?: string;
  baseUrl?: string;
}

export function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Resolve the API key, or exit with a recoverable, machine-readable failure.
 *
 * `frihet login` is interactive, so telling an unattended caller to run it is a
 * dead end. The JSON line names the recovery that works without a TTY and the
 * URL that actually issues a key (/settings/api — /settings/security is a
 * different panel and does not create one). The exit code stays 1: existing
 * scripts branch on it, and an agent should branch on `error.code` anyway.
 */
export function getApiKey(): string {
  const envKey = process.env['FRIHET_API_KEY'];
  if (envKey) return envKey;

  const config = loadConfig();
  if (config.apiKey) return config.apiKey;

  console.error(
    'No API key found.\n' +
      '  Interactive:     frihet login\n' +
      '  Non-interactive: export FRIHET_API_KEY=fri_...\n' +
      '  Create a key:    https://app.frihet.io/settings/api'
  );
  console.error(
    JSON.stringify({
      error: {
        code: 'FRIHET_API_KEY_MISSING',
        message: 'No API key found',
        obtainAt: 'https://app.frihet.io/settings/api',
        recovery: [
          { action: 'set_env', env: { FRIHET_API_KEY: 'fri_<key>' }, interactive: false },
          { action: 'run_command', command: 'frihet login', interactive: true },
        ],
        exitCode: 1,
      },
    })
  );
  process.exit(1);
}

export function getBaseUrl(): string | undefined {
  return process.env['FRIHET_API_URL'] ?? loadConfig().baseUrl;
}
