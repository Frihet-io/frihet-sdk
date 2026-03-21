import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, eur, success, error, outputJson, shouldOutputJson } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

const list = new Command('list')
  .description('List expenses')
  .option('--limit <n>', 'Max results', '20')
  .option('--from <date>', 'From date (YYYY-MM-DD)')
  .option('--to <date>', 'To date (YYYY-MM-DD)')
  .option('-q, --search <query>', 'Search expenses')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const f = client();
      const params = { limit: parseInt(opts.limit), from: opts.from, to: opts.to, q: opts.search };
      const page = opts.search
        ? await f.expenses.search(opts.search, params)
        : await f.expenses.list(params);

      if (shouldOutputJson()) {
        outputJson(page);
        return;
      }

      if (page.data.length === 0) {
        console.log(dim('No expenses found.'));
        return;
      }

      table(
        page.data.map(exp => [
          exp.id.slice(0, 8),
          exp.description.slice(0, 40),
          eur(exp.amount),
          exp.category ?? dim('--'),
          exp.date ?? dim('--'),
        ]),
        ['ID', 'Description', 'Amount', 'Category', 'Date'],
      );
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const get = new Command('get')
  .description('Get expense details')
  .argument('<id>', 'Expense ID')
  .option('--json', 'Output as JSON')
  .action(async (id: string) => {
    try {
      const exp = await client().expenses.retrieve(id);

      if (shouldOutputJson()) {
        outputJson(exp);
        return;
      }

      console.log(bold(exp.description));
      console.log(`ID:       ${dim(exp.id)}`);
      console.log(`Amount:   ${eur(exp.amount)}`);
      console.log(`Category: ${exp.category ?? dim('--')}`);
      console.log(`Date:     ${exp.date ?? dim('--')}`);
      console.log(`Vendor:   ${exp.vendor ?? dim('--')}`);
      if (exp.invoiceNumber) console.log(`Invoice#: ${exp.invoiceNumber}`);
      if (exp.tax !== undefined) console.log(`Tax:      ${eur(exp.tax)}`);
      if (exp.taxType) console.log(`Tax Type: ${exp.taxType}`);
      if (exp.irpf !== undefined) console.log(`IRPF:     ${eur(exp.irpf)}`);
      if (exp.taxDeductible !== undefined) console.log(`Deductible: ${exp.taxDeductible ? 'yes' : 'no'}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const create = new Command('create')
  .description('Create a new expense')
  .requiredOption('--desc <description>', 'Description')
  .requiredOption('--amount <amount>', 'Amount in EUR')
  .option('--category <cat>', 'Category (office, travel, software, marketing, professional, equipment, insurance, other)')
  .option('--vendor <name>', 'Vendor name')
  .option('--date <date>', 'Date (YYYY-MM-DD)')
  .option('--tax <rate>', 'Tax amount')
  .action(async (opts) => {
    try {
      const exp = await client().expenses.create({
        description: opts.desc,
        amount: parseFloat(opts.amount),
        category: opts.category,
        vendor: opts.vendor,
        date: opts.date,
        tax: opts.tax ? parseFloat(opts.tax) : undefined,
      });
      success(`Expense ${bold(exp.id.slice(0, 8))} created: ${exp.description} (${eur(exp.amount)})`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const update = new Command('update')
  .description('Update an expense')
  .argument('<id>', 'Expense ID')
  .option('--desc <description>', 'Description')
  .option('--amount <amount>', 'Amount in EUR')
  .option('--category <cat>', 'Category')
  .option('--vendor <name>', 'Vendor name')
  .option('--date <date>', 'Date (YYYY-MM-DD)')
  .option('--tax <rate>', 'Tax amount')
  .option('--tax-type <type>', 'Tax type: IVA, IGIC, IPSI, Exento')
  .option('--irpf <amount>', 'IRPF amount')
  .option('--deductible <bool>', 'Tax deductible (true/false)')
  .action(async (id: string, opts) => {
    try {
      const params: Record<string, unknown> = {};
      if (opts.desc !== undefined) params.description = opts.desc;
      if (opts.amount !== undefined) params.amount = parseFloat(opts.amount);
      if (opts.category !== undefined) params.category = opts.category;
      if (opts.vendor !== undefined) params.vendor = opts.vendor;
      if (opts.date !== undefined) params.date = opts.date;
      if (opts.tax !== undefined) params.tax = parseFloat(opts.tax);
      if (opts.taxType !== undefined) params.taxType = opts.taxType;
      if (opts.irpf !== undefined) params.irpf = parseFloat(opts.irpf);
      if (opts.deductible !== undefined) params.taxDeductible = opts.deductible === 'true';

      const exp = await client().expenses.update(id, params);
      success(`Expense ${bold(exp.id.slice(0, 8))} updated: ${exp.description}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const del = new Command('delete')
  .description('Delete an expense')
  .argument('<id>', 'Expense ID')
  .action(async (id: string) => {
    try {
      await client().expenses.del(id);
      success(`Expense ${bold(id)} deleted`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const expensesCommand = new Command('expenses')
  .description('Manage expenses')
  .addCommand(list)
  .addCommand(get)
  .addCommand(create)
  .addCommand(update)
  .addCommand(del);
