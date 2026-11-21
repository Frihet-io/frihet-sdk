import { Command } from 'commander';
import { Frihet, type BankTransactionStatus } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, dim, eur, green, red, yellow, error, outputJson, shouldOutputJson } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

function txStatusColor(status: string | undefined): string {
  switch (status) {
    case 'matched':
    case 'categorized':
      return green(status);
    case 'recognized':
      return yellow(status);
    case 'excluded':
      return dim(status);
    case 'raw':
      return red(status);
    default:
      return status ?? dim('--');
  }
}

function parseOptionalInt(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const accounts = new Command('accounts')
  .description('List connected bank accounts')
  .option('--provider <provider>', 'Filter by provider (e.g. saltedge, tink, manual)')
  .option('--active', 'Show only active accounts')
  .option('--inactive', 'Show only inactive accounts')
  .option('--limit <n>', 'Max results', '20')
  .option('--offset <n>', 'Pagination offset')
  .option('--json', 'Output as JSON')
  .action(async (opts: {
    provider?: string;
    active?: boolean;
    inactive?: boolean;
    limit?: string;
    offset?: string;
  }) => {
    try {
      const isActive = opts.active ? true : opts.inactive ? false : undefined;
      const page = await client().banking.listAccounts({
        provider: opts.provider,
        isActive,
        limit: parseOptionalInt(opts.limit),
        offset: parseOptionalInt(opts.offset),
      });

      if (shouldOutputJson()) {
        outputJson(page);
        return;
      }

      if (page.data.length === 0) {
        console.log(dim('No bank accounts found.'));
        return;
      }

      const rows = page.data.map(acc => [
        acc.id.slice(0, 12),
        acc.bankName ?? dim('--'),
        acc.accountName ?? dim('--'),
        acc.iban ?? acc.accountNumber ?? dim('--'),
        acc.currency ?? 'EUR',
        acc.isActive ? green('active') : dim('inactive'),
      ]);

      table(rows, ['ID', 'Bank', 'Account', 'IBAN', 'Currency', 'Status']);
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const transactions = new Command('transactions')
  .description('List bank transactions')
  .option('--account <id>', 'Filter by bank account ID')
  .option('--from <date>', 'From date (YYYY-MM-DD)')
  .option('--to <date>', 'To date (YYYY-MM-DD)')
  .option('--status <status>', 'Filter: raw, recognized, matched, categorized, excluded')
  .option('--category <category>', 'Filter by category')
  .option('--reconciled <bool>', 'Filter by reconciliation state (true|false)')
  .option('--limit <n>', 'Max results', '20')
  .option('--offset <n>', 'Pagination offset')
  .option('--json', 'Output as JSON')
  .action(async (opts: {
    account?: string;
    from?: string;
    to?: string;
    status?: BankTransactionStatus;
    category?: string;
    reconciled?: string;
    limit?: string;
    offset?: string;
  }) => {
    try {
      let reconciled: boolean | undefined;
      if (opts.reconciled !== undefined) {
        const normalized = opts.reconciled.toLowerCase();
        if (normalized === 'true' || normalized === '1') reconciled = true;
        else if (normalized === 'false' || normalized === '0') reconciled = false;
        else throw new Error(`Invalid --reconciled value "${opts.reconciled}". Use true or false.`);
      }

      const page = await client().banking.listTransactions({
        accountId: opts.account,
        from: opts.from,
        to: opts.to,
        status: opts.status,
        category: opts.category,
        reconciled,
        limit: parseOptionalInt(opts.limit),
        offset: parseOptionalInt(opts.offset),
      });

      if (shouldOutputJson()) {
        outputJson(page);
        return;
      }

      if (page.data.length === 0) {
        console.log(dim('No bank transactions found.'));
        return;
      }

      const rows = page.data.map(tx => [
        tx.date ?? dim('--'),
        tx.description.length > 40 ? tx.description.slice(0, 37) + '...' : tx.description,
        tx.amount >= 0 ? green(eur(tx.amount)) : red(eur(tx.amount)),
        tx.category ?? dim('--'),
        txStatusColor(tx.status),
      ]);

      table(rows, ['Date', 'Description', 'Amount', 'Category', 'Status']);
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const bankingCommand = new Command('banking')
  .description('Inspect connected bank accounts and transactions')
  .addCommand(accounts)
  .addCommand(transactions);
