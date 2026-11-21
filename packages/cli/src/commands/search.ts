import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, cyan, dim, eur, error, outputJson, shouldOutputJson } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

function parseOptionalInt(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export const searchCommand = new Command('search')
  .description('Search across invoices, expenses, vendors, clients, and products')
  .argument('<query>', 'Search text')
  .option('--types <types>', 'Comma-separated resource types: invoices,expenses,vendors,clients,products')
  .option('--limit <n>', 'Max results (1-50)', '25')
  .option('--offset <n>', 'Pagination offset')
  .option('--json', 'Output as JSON')
  .action(async (query: string, opts: { types?: string; limit?: string; offset?: string }) => {
    try {
      const result = await client().search.global(query, {
        types: opts.types,
        limit: parseOptionalInt(opts.limit),
        offset: parseOptionalInt(opts.offset),
      });

      if (shouldOutputJson()) {
        outputJson(result);
        return;
      }

      if (result.data.length === 0) {
        console.log(dim(`No results for "${query}".`));
        return;
      }

      const rows = result.data.map(item => [
        cyan(item.type),
        item.id.slice(0, 12),
        item.label,
        item.secondary ?? dim('--'),
        item.amount !== null ? eur(item.amount) : dim('--'),
        item.status ?? dim('--'),
      ]);

      table(rows, ['Type', 'ID', 'Label', 'Detail', 'Amount', 'Status']);
      console.log(dim(`\n${result.total} total, showing ${result.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
