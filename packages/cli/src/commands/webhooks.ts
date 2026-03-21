import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, green, red, yellow, success, error } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

function statusColor(status: string | undefined): string {
  switch (status) {
    case 'active': return green(status);
    case 'inactive': return red(status);
    case 'paused': return yellow(status);
    default: return status ?? dim('--');
  }
}

const list = new Command('list')
  .description('List webhooks')
  .option('--limit <n>', 'Max results', '20')
  .action(async (opts) => {
    try {
      const page = await client().webhooks.list({ limit: parseInt(opts.limit) });

      if (page.data.length === 0) {
        console.log(dim('No webhooks found.'));
        return;
      }

      table(
        page.data.map(w => [
          w.id.slice(0, 8),
          w.name ?? dim('--'),
          w.url.length > 50 ? w.url.slice(0, 47) + '...' : w.url,
          statusColor(w.status),
          String(w.events.length) + ' events',
        ]),
        ['ID', 'Name', 'URL', 'Status', 'Events'],
      );
      console.log(dim(`\n${page.total} total, showing ${page.data.length}`));
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const get = new Command('get')
  .description('Get webhook details')
  .argument('<id>', 'Webhook ID')
  .action(async (id: string) => {
    try {
      const w = await client().webhooks.retrieve(id);
      console.log(bold(w.name ?? w.id));
      console.log(`ID:     ${dim(w.id)}`);
      console.log(`URL:    ${w.url}`);
      console.log(`Status: ${statusColor(w.status)}`);
      console.log(`Events: ${w.events.join(', ')}`);
      if (w.secret) console.log(`Secret: ${dim(w.secret.slice(0, 8) + '...')}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const create = new Command('create')
  .description('Create a new webhook')
  .requiredOption('--url <url>', 'Webhook endpoint URL')
  .requiredOption('--events <events...>', 'Events to listen for (e.g. invoice.created invoice.paid)')
  .option('--name <name>', 'Webhook name')
  .option('--secret <secret>', 'Signing secret')
  .action(async (opts) => {
    try {
      const w = await client().webhooks.create({
        url: opts.url,
        events: opts.events,
        name: opts.name,
        secret: opts.secret,
      });
      success(`Webhook ${bold(w.name ?? w.id.slice(0, 8))} created`);
      console.log(`URL:    ${w.url}`);
      console.log(`Events: ${w.events.join(', ')}`);
      if (w.secret) console.log(`Secret: ${dim(w.secret)}`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const update = new Command('update')
  .description('Update a webhook')
  .argument('<id>', 'Webhook ID')
  .option('--url <url>', 'Webhook endpoint URL')
  .option('--events <events...>', 'Events to listen for')
  .option('--name <name>', 'Webhook name')
  .option('--status <status>', 'Status: active, inactive, paused')
  .option('--secret <secret>', 'Signing secret')
  .action(async (id: string, opts) => {
    try {
      const params: Record<string, unknown> = {};
      if (opts.url) params.url = opts.url;
      if (opts.events) params.events = opts.events;
      if (opts.name) params.name = opts.name;
      if (opts.status) params.status = opts.status;
      if (opts.secret) params.secret = opts.secret;

      const w = await client().webhooks.update(id, params);
      success(`Webhook ${bold(w.name ?? w.id.slice(0, 8))} updated`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const del = new Command('delete')
  .description('Delete a webhook')
  .argument('<id>', 'Webhook ID')
  .action(async (id: string) => {
    try {
      await client().webhooks.del(id);
      success(`Webhook ${bold(id)} deleted`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export const webhooksCommand = new Command('webhooks')
  .description('Manage webhooks')
  .addCommand(list)
  .addCommand(get)
  .addCommand(create)
  .addCommand(update)
  .addCommand(del);
