import { Command } from 'commander';
import { saveConfig, loadConfig } from '../config.js';
import { success, error, bold, dim } from '../output.js';
import { Frihet } from '@frihet/sdk';
import { createInterface } from 'node:readline';

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const loginCommand = new Command('login')
  .description('Configure your Frihet API key')
  .option('--key <apiKey>', 'API key (or enter interactively)')
  .option('--url <baseUrl>', 'Custom API base URL')
  .action(async (opts: { key?: string; url?: string }) => {
    let apiKey = opts.key;

    if (!apiKey) {
      console.error(bold('Frihet CLI Login'));
      console.error(dim('Get your API key at https://app.frihet.io/settings/security\n'));
      apiKey = await prompt('API key: ');
    }

    if (!apiKey || !apiKey.startsWith('fri_')) {
      error('Invalid API key. Must start with fri_');
      process.exit(1);
    }

    // Verify the key works
    try {
      const frihet = new Frihet({ apiKey, baseUrl: opts.url });
      const ctx = await frihet.intelligence.context();
      const business = ctx.business as Record<string, string> | undefined;
      const name = business?.businessName ?? business?.name ?? 'your account';

      const config = loadConfig();
      config.apiKey = apiKey;
      if (opts.url) config.baseUrl = opts.url;
      saveConfig(config);

      success(`Authenticated as ${bold(name)}. Key saved to ~/.frihet/config.json`);
    } catch (err) {
      error(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
