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

export function getApiKey(): string {
  const envKey = process.env['FRIHET_API_KEY'];
  if (envKey) return envKey;

  const config = loadConfig();
  if (config.apiKey) return config.apiKey;

  console.error('No API key found. Run `frihet login` or set FRIHET_API_KEY.');
  process.exit(1);
}

export function getBaseUrl(): string | undefined {
  return process.env['FRIHET_API_URL'] ?? loadConfig().baseUrl;
}
