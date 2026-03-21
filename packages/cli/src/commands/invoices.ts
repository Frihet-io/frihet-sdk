import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, eur, green, red, yellow, success, error, outputJson, shouldOutputJson } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

function statusColor(status: string | undefined): string {
  switch (status) {
    case 'paid': return green(status);
    case 'overdue': return red(status);
    case 'sent': return yellow(status);
    case 'draft': return dim(status);
    case 'cancelled': return dim(status);
    default: return status ?? dim('--');
  }
}

const list = new Command('list')
  .description('List invoices')
  .option('--status <status>', 'Filter: draft, sent, paid, overdue, cancelled')
  .option('--limit <n>', 'Max results', '20')
  .option('--from <date>', 'From date (YYYY-MM-DD)')
  .option('--to <date>', 'To date (YYYY-MM-DD)')
  .option('-q, --search <query>', 'Search by client name or document number')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const f = client();
      const params = {
        limit: parseInt(opts.limit),
        status: opts.status,
        from: opts.from,
        to: opts.to,
        q: opts.search,
      };
      const page = opts.search
        ? await f.invoices.search(opts.search, params)
        : await f.invoices.list(params);

      if (shouldOutputJson()) {
        outputJson(page);
        return;
      }

      if (page.data.length === 0) {
        console.log(dim('No invoices found.'));
        return;
      }

      const rows = page.data.map(inv => [
        inv.documentNumber ?? inv.id.slice(0, 8),
        inv.clientName,
        eur(inv.total),
        statusColor(inv.status),
        inv.dueDate ?? dim('--'),
      ]);

      table(rows, ['Number', 'Client', 'Amount', 'Status', 'Due']);
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const get = new Command('get')
  .description('Get invoice details')
  .argument('<id>', 'Invoice ID or document number')
  .option('--json', 'Output as JSON')
  .action(async (id: string) => {
    try {
      const inv = await client().invoices.retrieve(id);

      if (shouldOutputJson()) {
        outputJson(inv);
        return;
      }

      console.log(bold(inv.documentNumber ?? inv.id));
      console.log(`Client:  ${inv.clientName}`);
      console.log(`Status:  ${statusColor(inv.status)}`);
      console.log(`Amount:  ${eur(inv.total)}`);
      console.log(`Issued:  ${inv.issueDate ?? dim('--')}`);
      console.log(`Due:     ${inv.dueDate ?? dim('--')}`);
      if (inv.notes) console.log(`Notes:   ${inv.notes}`);
      if (inv.items?.length) {
        console.log(dim('\nItems:'));
        table(
          inv.items.map(item => [
            item.description,
            String(item.quantity),
            eur(item.unitPrice),
            eur(item.quantity * item.unitPrice),
          ]),
          ['Description', 'Qty', 'Price', 'Subtotal'],
        );
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const create = new Command('create')
  .description('Create a new invoice')
  .requiredOption('--client <name>', 'Client name')
  .requiredOption('--item <items...>', 'Items as "description,qty,price" (repeatable)')
  .option('--due <date>', 'Due date (YYYY-MM-DD)')
  .option('--tax <rate>', 'Tax rate (e.g. 21)')
  .option('--notes <text>', 'Invoice notes')
  .option('--send <email>', 'Send immediately to this email')
  .action(async (opts) => {
    try {
      const items = (opts.item as string[]).map(raw => {
        const parts = raw.split(',');
        if (parts.length < 3) throw new Error(`Invalid item format: "${raw}". Use "description,qty,price"`);
        return {
          description: parts[0]!.trim(),
          quantity: parseFloat(parts[1]!),
          unitPrice: parseFloat(parts[2]!),
        };
      });

      const f = client();
      const inv = await f.invoices.create({
        clientName: opts.client,
        items,
        dueDate: opts.due,
        taxRate: opts.tax ? parseFloat(opts.tax) : undefined,
        notes: opts.notes,
      });

      success(`Invoice ${bold(inv.documentNumber ?? inv.id)} created (${eur(inv.total)})`);

      if (opts.send) {
        await f.invoices.send(inv.id, { recipientEmail: opts.send });
        success(`Sent to ${opts.send}`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const update = new Command('update')
  .description('Update an invoice')
  .argument('<id>', 'Invoice ID')
  .option('--client <name>', 'Client name')
  .option('--status <status>', 'Status: draft, sent, paid, overdue, cancelled')
  .option('--due <date>', 'Due date (YYYY-MM-DD)')
  .option('--notes <text>', 'Invoice notes')
  .option('--tax <rate>', 'Tax rate')
  .option('--irpf <rate>', 'IRPF rate')
  .action(async (id: string, opts) => {
    try {
      const params: Record<string, unknown> = {};
      if (opts.client !== undefined) params.clientName = opts.client;
      if (opts.status !== undefined) params.status = opts.status;
      if (opts.due !== undefined) params.dueDate = opts.due;
      if (opts.notes !== undefined) params.notes = opts.notes;
      if (opts.tax !== undefined) params.taxRate = parseFloat(opts.tax);
      if (opts.irpf !== undefined) params.irpfRate = parseFloat(opts.irpf);

      const inv = await client().invoices.update(id, params);
      success(`Invoice ${bold(inv.documentNumber ?? inv.id)} updated`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const del = new Command('delete')
  .description('Delete an invoice')
  .argument('<id>', 'Invoice ID')
  .action(async (id: string) => {
    try {
      await client().invoices.del(id);
      success(`Invoice ${bold(id)} deleted`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const markPaid = new Command('paid')
  .description('Mark invoice as paid')
  .argument('<id>', 'Invoice ID')
  .option('--date <date>', 'Payment date (YYYY-MM-DD, defaults to today)')
  .action(async (id: string, opts: { date?: string }) => {
    try {
      const result = await client().invoices.markPaid(id, opts.date);
      success(`Invoice ${bold(id)} marked as ${green(result.status)} (${result.paidAt ?? 'today'})`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const send = new Command('send')
  .description('Send invoice by email')
  .argument('<id>', 'Invoice ID')
  .requiredOption('--to <email>', 'Recipient email')
  .option('--message <text>', 'Custom message')
  .action(async (id: string, opts: { to: string; message?: string }) => {
    try {
      const result = await client().invoices.send(id, {
        recipientEmail: opts.to,
        customMessage: opts.message,
      });
      success(`Invoice sent (message ID: ${dim(result.messageId)})`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const pdf = new Command('pdf')
  .description('Download invoice as PDF')
  .argument('<id>', 'Invoice ID')
  .option('-o, --output <path>', 'Output file path')
  .action(async (id: string, opts: { output?: string }) => {
    try {
      const { writeFileSync } = await import('node:fs');
      const buffer = await client().invoices.pdf(id);
      const outPath = opts.output ?? `invoice-${id}.pdf`;
      writeFileSync(outPath, Buffer.from(buffer));
      success(`PDF saved to ${bold(outPath)}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const invoicesCommand = new Command('invoices')
  .description('Manage invoices')
  .addCommand(list)
  .addCommand(get)
  .addCommand(create)
  .addCommand(update)
  .addCommand(del)
  .addCommand(markPaid)
  .addCommand(send)
  .addCommand(pdf);
