import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, eur, green, yellow, red, success, error, outputJson, shouldOutputJson } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

function statusColor(status: string | undefined): string {
  switch (status) {
    case 'accepted': return green(status);
    case 'sent': return yellow(status);
    case 'rejected': return red(status);
    case 'expired': return red(status);
    case 'draft': return dim(status);
    case 'cancelled': return dim(status);
    default: return status ?? dim('--');
  }
}

const list = new Command('list')
  .description('List quotes')
  .option('--status <status>', 'Filter: draft, sent, accepted, rejected, expired, cancelled')
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
        ? await f.quotes.search(opts.search, params)
        : await f.quotes.list(params);

      if (shouldOutputJson()) {
        outputJson(page);
        return;
      }

      if (page.data.length === 0) {
        console.log(dim('No quotes found.'));
        return;
      }

      const rows = page.data.map(q => [
        q.documentNumber ?? q.id.slice(0, 8),
        q.clientName,
        eur(q.total),
        statusColor(q.status),
        q.validUntil ?? dim('--'),
      ]);

      table(rows, ['Number', 'Client', 'Amount', 'Status', 'Valid Until']);
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const get = new Command('get')
  .description('Get quote details')
  .argument('<id>', 'Quote ID or document number')
  .option('--json', 'Output as JSON')
  .action(async (id: string) => {
    try {
      const q = await client().quotes.retrieve(id);

      if (shouldOutputJson()) {
        outputJson(q);
        return;
      }

      console.log(bold(q.documentNumber ?? q.id));
      console.log(`Client:      ${q.clientName}`);
      console.log(`Status:      ${statusColor(q.status)}`);
      console.log(`Amount:      ${eur(q.total)}`);
      console.log(`Valid Until: ${q.validUntil ?? dim('--')}`);
      if (q.notes) console.log(`Notes:       ${q.notes}`);
      if (q.items?.length) {
        console.log(dim('\nItems:'));
        table(
          q.items.map(item => [
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
  .description('Create a new quote')
  .requiredOption('--client <name>', 'Client name')
  .requiredOption('--item <items...>', 'Items as "description,qty,price" (repeatable)')
  .option('--valid-until <date>', 'Valid until date (YYYY-MM-DD)')
  .option('--tax <rate>', 'Tax rate (e.g. 21)')
  .option('--notes <text>', 'Quote notes')
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
      const q = await f.quotes.create({
        clientName: opts.client,
        items,
        validUntil: opts.validUntil,
        taxRate: opts.tax ? parseFloat(opts.tax) : undefined,
        notes: opts.notes,
      });

      success(`Quote ${bold(q.documentNumber ?? q.id)} created (${eur(q.total)})`);

      if (opts.send) {
        await f.quotes.send(q.id, { recipientEmail: opts.send });
        success(`Sent to ${opts.send}`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const update = new Command('update')
  .description('Update a quote')
  .argument('<id>', 'Quote ID')
  .option('--client <name>', 'Client name')
  .option('--valid-until <date>', 'Valid until date (YYYY-MM-DD)')
  .option('--tax <rate>', 'Tax rate')
  .option('--notes <text>', 'Notes')
  .option('--status <status>', 'Status: draft, sent, accepted, rejected, expired, cancelled')
  .action(async (id: string, opts) => {
    try {
      const params: Record<string, unknown> = {};
      if (opts.client !== undefined) params.clientName = opts.client;
      if (opts.validUntil !== undefined) params.validUntil = opts.validUntil;
      if (opts.tax !== undefined) params.taxRate = parseFloat(opts.tax);
      if (opts.notes !== undefined) params.notes = opts.notes;
      if (opts.status !== undefined) params.status = opts.status;

      const q = await client().quotes.update(id, params);
      success(`Quote ${bold(q.documentNumber ?? q.id)} updated`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const del = new Command('delete')
  .description('Delete a quote')
  .argument('<id>', 'Quote ID')
  .action(async (id: string) => {
    try {
      await client().quotes.del(id);
      success(`Quote ${bold(id)} deleted`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const pdf = new Command('pdf')
  .description('Download quote as PDF')
  .argument('<id>', 'Quote ID')
  .option('-o, --output <path>', 'Output file path')
  .action(async (id: string, opts: { output?: string }) => {
    try {
      const { writeFileSync } = await import('node:fs');
      const buffer = await client().quotes.pdf(id);
      const outPath = opts.output ?? `quote-${id}.pdf`;
      writeFileSync(outPath, Buffer.from(buffer));
      success(`PDF saved to ${bold(outPath)}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const send = new Command('send')
  .description('Send quote by email')
  .argument('<id>', 'Quote ID')
  .requiredOption('--to <email>', 'Recipient email')
  .option('--message <text>', 'Custom message')
  .action(async (id: string, opts: { to: string; message?: string }) => {
    try {
      const result = await client().quotes.send(id, {
        recipientEmail: opts.to,
        customMessage: opts.message,
      });
      success(`Quote sent (message ID: ${dim(result.messageId)})`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const quotesCommand = new Command('quotes')
  .description('Manage quotes')
  .addCommand(list)
  .addCommand(get)
  .addCommand(create)
  .addCommand(update)
  .addCommand(del)
  .addCommand(pdf)
  .addCommand(send);
