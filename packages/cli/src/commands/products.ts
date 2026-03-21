import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, eur, green, red, success, error } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

const list = new Command('list')
  .description('List products')
  .option('--limit <n>', 'Max results', '20')
  .option('-q, --search <query>', 'Search products')
  .action(async (opts) => {
    try {
      const f = client();
      const params = { limit: parseInt(opts.limit), q: opts.search };
      const page = opts.search
        ? await f.products.search(opts.search, params)
        : await f.products.list(params);

      if (page.data.length === 0) {
        console.log(dim('No products found.'));
        return;
      }

      table(
        page.data.map(p => [
          p.id.slice(0, 8),
          p.name,
          eur(p.unitPrice),
          p.sku ?? dim('--'),
          p.category ?? dim('--'),
          p.isActive === false ? red('inactive') : green('active'),
        ]),
        ['ID', 'Name', 'Price', 'SKU', 'Category', 'Status'],
      );
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const get = new Command('get')
  .description('Get product details')
  .argument('<id>', 'Product ID')
  .action(async (id: string) => {
    try {
      const p = await client().products.retrieve(id);
      console.log(bold(p.name));
      console.log(`ID:       ${dim(p.id)}`);
      console.log(`Price:    ${eur(p.unitPrice)}`);
      console.log(`SKU:      ${p.sku ?? dim('--')}`);
      console.log(`Category: ${p.category ?? dim('--')}`);
      console.log(`Status:   ${p.isActive === false ? red('inactive') : green('active')}`);
      if (p.description) console.log(`Desc:     ${p.description}`);
      if (p.taxRate !== undefined) console.log(`Tax:      ${p.taxRate}%`);
      if (p.irpfRate !== undefined) console.log(`IRPF:     ${p.irpfRate}%`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const create = new Command('create')
  .description('Create a new product')
  .requiredOption('--name <name>', 'Product name')
  .requiredOption('--price <price>', 'Unit price in EUR')
  .option('--sku <sku>', 'SKU code')
  .option('--category <cat>', 'Category')
  .option('--desc <description>', 'Description')
  .option('--tax <rate>', 'Tax rate (e.g. 21)')
  .action(async (opts) => {
    try {
      const p = await client().products.create({
        name: opts.name,
        unitPrice: parseFloat(opts.price),
        sku: opts.sku,
        category: opts.category,
        description: opts.desc,
        taxRate: opts.tax ? parseFloat(opts.tax) : undefined,
      });
      success(`Product ${bold(p.name)} created (${eur(p.unitPrice)}) ${dim(p.id.slice(0, 8))}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const update = new Command('update')
  .description('Update a product')
  .argument('<id>', 'Product ID')
  .option('--name <name>', 'Product name')
  .option('--price <price>', 'Unit price in EUR')
  .option('--sku <sku>', 'SKU code')
  .option('--category <cat>', 'Category')
  .option('--desc <description>', 'Description')
  .option('--tax <rate>', 'Tax rate')
  .option('--active <bool>', 'Active status (true/false)')
  .action(async (id: string, opts) => {
    try {
      const params: Record<string, unknown> = {};
      if (opts.name) params.name = opts.name;
      if (opts.price) params.unitPrice = parseFloat(opts.price);
      if (opts.sku) params.sku = opts.sku;
      if (opts.category) params.category = opts.category;
      if (opts.desc) params.description = opts.desc;
      if (opts.tax) params.taxRate = parseFloat(opts.tax);
      if (opts.active !== undefined) params.isActive = opts.active === 'true';

      const p = await client().products.update(id, params);
      success(`Product ${bold(p.name)} updated`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const del = new Command('delete')
  .description('Delete a product')
  .argument('<id>', 'Product ID')
  .action(async (id: string) => {
    try {
      await client().products.del(id);
      success(`Product ${bold(id)} deleted`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const productsCommand = new Command('products')
  .description('Manage products')
  .addCommand(list)
  .addCommand(get)
  .addCommand(create)
  .addCommand(update)
  .addCommand(del);
