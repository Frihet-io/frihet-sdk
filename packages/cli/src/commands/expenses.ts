import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, eur, success, error } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

const list = new Command('list')
  .description('List expenses')
  .option('--limit <n>', 'Max results', '20')
  .option('--from <date>', 'From date (YYYY-MM-DD)')
  .option('--to <date>', 'To date (YYYY-MM-DD)')
  .option('-q, --search <query>', 'Search expenses')
  .action(async (opts) => {
    try {
      const f = client();
      const params = { limit: parseInt(opts.limit), from: opts.from, to: opts.to, q: opts.search };
      const page = opts.search
        ? await f.expenses.search(opts.search, params)
        : await f.expenses.list(params);

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

export const expensesCommand = new Command('expenses')
  .description('Manage expenses')
  .addCommand(list)
  .addCommand(create);
