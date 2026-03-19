import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, success, error } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

const list = new Command('list')
  .description('List clients')
  .option('--limit <n>', 'Max results', '20')
  .option('-q, --search <query>', 'Search clients')
  .action(async (opts) => {
    try {
      const f = client();
      const params = { limit: parseInt(opts.limit), q: opts.search };
      const page = opts.search
        ? await f.clients.search(opts.search, params)
        : await f.clients.list(params);

      if (page.data.length === 0) {
        console.log(dim('No clients found.'));
        return;
      }

      table(
        page.data.map(c => [
          c.id.slice(0, 8),
          c.name,
          c.email ?? dim('--'),
          c.taxId ?? dim('--'),
          c.stage ?? dim('--'),
        ]),
        ['ID', 'Name', 'Email', 'Tax ID', 'Stage'],
      );
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const create = new Command('create')
  .description('Create a new client')
  .requiredOption('--name <name>', 'Client name')
  .option('--email <email>', 'Email')
  .option('--phone <phone>', 'Phone')
  .option('--tax-id <taxId>', 'Tax ID (NIF/VAT)')
  .option('--zone <zone>', 'Fiscal zone: peninsula, canarias, eu, world')
  .action(async (opts) => {
    try {
      const c = await client().clients.create({
        name: opts.name,
        email: opts.email,
        phone: opts.phone,
        taxId: opts.taxId,
        fiscalZone: opts.zone,
      });
      success(`Client ${bold(c.name)} created (${dim(c.id.slice(0, 8))})`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const clientsCommand = new Command('clients')
  .description('Manage clients')
  .addCommand(list)
  .addCommand(create);
