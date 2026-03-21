import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, success, error } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

const list = new Command('list')
  .description('List vendors')
  .option('--limit <n>', 'Max results', '20')
  .option('-q, --search <query>', 'Search vendors')
  .action(async (opts) => {
    try {
      const f = client();
      const params = { limit: parseInt(opts.limit), q: opts.search };
      const page = opts.search
        ? await f.vendors.search(opts.search, params)
        : await f.vendors.list(params);

      if (page.data.length === 0) {
        console.log(dim('No vendors found.'));
        return;
      }

      table(
        page.data.map(v => [
          v.id.slice(0, 8),
          v.name,
          v.email ?? dim('--'),
          v.phone ?? dim('--'),
          v.taxId ?? dim('--'),
        ]),
        ['ID', 'Name', 'Email', 'Phone', 'Tax ID'],
      );
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const get = new Command('get')
  .description('Get vendor details')
  .argument('<id>', 'Vendor ID')
  .action(async (id: string) => {
    try {
      const v = await client().vendors.retrieve(id);
      console.log(bold(v.name));
      console.log(`ID:     ${dim(v.id)}`);
      console.log(`Email:  ${v.email ?? dim('--')}`);
      console.log(`Phone:  ${v.phone ?? dim('--')}`);
      console.log(`Tax ID: ${v.taxId ?? dim('--')}`);
      if (v.address) {
        const addr = typeof v.address === 'string' ? v.address : [v.address.street, v.address.city, v.address.postalCode, v.address.country].filter(Boolean).join(', ');
        console.log(`Address: ${addr}`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const create = new Command('create')
  .description('Create a new vendor')
  .requiredOption('--name <name>', 'Vendor name')
  .option('--email <email>', 'Email')
  .option('--phone <phone>', 'Phone')
  .option('--tax-id <taxId>', 'Tax ID (NIF/VAT)')
  .action(async (opts) => {
    try {
      const v = await client().vendors.create({
        name: opts.name,
        email: opts.email,
        phone: opts.phone,
        taxId: opts.taxId,
      });
      success(`Vendor ${bold(v.name)} created (${dim(v.id.slice(0, 8))})`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const update = new Command('update')
  .description('Update a vendor')
  .argument('<id>', 'Vendor ID')
  .option('--name <name>', 'Vendor name')
  .option('--email <email>', 'Email')
  .option('--phone <phone>', 'Phone')
  .option('--tax-id <taxId>', 'Tax ID (NIF/VAT)')
  .action(async (id: string, opts) => {
    try {
      const params: Record<string, unknown> = {};
      if (opts.name) params.name = opts.name;
      if (opts.email) params.email = opts.email;
      if (opts.phone) params.phone = opts.phone;
      if (opts.taxId) params.taxId = opts.taxId;

      const v = await client().vendors.update(id, params);
      success(`Vendor ${bold(v.name)} updated`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const del = new Command('delete')
  .description('Delete a vendor')
  .argument('<id>', 'Vendor ID')
  .action(async (id: string) => {
    try {
      await client().vendors.del(id);
      success(`Vendor ${bold(id)} deleted`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const vendorsCommand = new Command('vendors')
  .description('Manage vendors')
  .addCommand(list)
  .addCommand(get)
  .addCommand(create)
  .addCommand(update)
  .addCommand(del);
