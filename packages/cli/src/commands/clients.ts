import { Command } from 'commander';
import { Frihet } from '@frihet/sdk';
import { getApiKey, getBaseUrl } from '../config.js';
import { table, bold, dim, success, error, outputJson, shouldOutputJson } from '../output.js';

function client(): Frihet {
  return new Frihet({ apiKey: getApiKey(), baseUrl: getBaseUrl() });
}

const list = new Command('list')
  .description('List clients')
  .option('--limit <n>', 'Max results', '20')
  .option('-q, --search <query>', 'Search clients')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const f = client();
      const params = { limit: parseInt(opts.limit), q: opts.search };
      const page = opts.search
        ? await f.clients.search(opts.search, params)
        : await f.clients.list(params);

      if (shouldOutputJson()) {
        outputJson(page);
        return;
      }

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

// --- CRM: Contacts ---

const contactsList = new Command('list')
  .description('List contacts for a client')
  .requiredOption('--client <id>', 'Client ID')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const page = await client().clients.listContacts(opts.client);
      if (shouldOutputJson()) { outputJson(page); return; }
      if (page.data.length === 0) { console.log(dim('No contacts found.')); return; }
      table(
        page.data.map(c => [c.id.slice(0, 8), c.name, c.email ?? dim('--'), c.role ?? dim('--'), c.isPrimary ? bold('Primary') : '']),
        ['ID', 'Name', 'Email', 'Role', 'Primary'],
      );
    } catch (err) { error(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });

const contactsCreate = new Command('create')
  .description('Add a contact person to a client')
  .requiredOption('--client <id>', 'Client ID')
  .requiredOption('--name <name>', 'Contact name')
  .option('--email <email>', 'Email')
  .option('--phone <phone>', 'Phone')
  .option('--role <role>', 'Role (e.g., CEO, CFO, Accountant)')
  .option('--primary', 'Set as primary contact')
  .action(async (opts) => {
    try {
      const c = await client().clients.createContact(opts.client, {
        name: opts.name, email: opts.email, phone: opts.phone, role: opts.role, isPrimary: opts.primary ?? false,
      });
      success(`Contact ${bold(c.name)} created`);
    } catch (err) { error(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });

const contactsDelete = new Command('delete')
  .description('Delete a contact')
  .requiredOption('--client <id>', 'Client ID')
  .requiredOption('--contact <id>', 'Contact ID')
  .action(async (opts) => {
    try {
      await client().clients.deleteContact(opts.client, opts.contact);
      success('Contact deleted');
    } catch (err) { error(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });

const contactsCommand = new Command('contacts')
  .description('Manage client contact persons')
  .addCommand(contactsList)
  .addCommand(contactsCreate)
  .addCommand(contactsDelete);

// --- CRM: Activities ---

const activitiesList = new Command('list')
  .description('List activity timeline for a client')
  .requiredOption('--client <id>', 'Client ID')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const page = await client().clients.listActivities(opts.client);
      if (shouldOutputJson()) { outputJson(page); return; }
      if (page.data.length === 0) { console.log(dim('No activities found.')); return; }
      table(
        page.data.map(a => [a.timestamp?.slice(0, 10) ?? '', a.type, a.title, a.createdBy ?? '']),
        ['Date', 'Type', 'Title', 'By'],
      );
    } catch (err) { error(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });

const activitiesCreate = new Command('create')
  .description('Log a manual activity (call, meeting, task)')
  .requiredOption('--client <id>', 'Client ID')
  .requiredOption('--type <type>', 'Type: call, email, meeting, task')
  .requiredOption('--title <title>', 'Activity title')
  .option('--desc <description>', 'Description')
  .action(async (opts) => {
    try {
      const a = await client().clients.createActivity(opts.client, {
        type: opts.type, title: opts.title, description: opts.desc,
      });
      success(`Activity "${bold(a.title)}" logged`);
    } catch (err) { error(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });

const activitiesCommand = new Command('activities')
  .description('View client activity timeline')
  .addCommand(activitiesList)
  .addCommand(activitiesCreate);

// --- CRM: Notes ---

const notesList = new Command('list')
  .description('List notes for a client')
  .requiredOption('--client <id>', 'Client ID')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    try {
      const page = await client().clients.listNotes(opts.client);
      if (shouldOutputJson()) { outputJson(page); return; }
      if (page.data.length === 0) { console.log(dim('No notes found.')); return; }
      table(
        page.data.map(n => [n.id.slice(0, 8), n.content.slice(0, 60), n.createdAt?.slice(0, 10) ?? '']),
        ['ID', 'Content', 'Created'],
      );
    } catch (err) { error(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });

const notesCreate = new Command('create')
  .description('Add a note to a client')
  .requiredOption('--client <id>', 'Client ID')
  .requiredOption('--content <text>', 'Note content')
  .action(async (opts) => {
    try {
      const n = await client().clients.createNote(opts.client, { content: opts.content });
      success(`Note created (${dim(n.id.slice(0, 8))})`);
    } catch (err) { error(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });

const notesDelete = new Command('delete')
  .description('Delete a note')
  .requiredOption('--client <id>', 'Client ID')
  .requiredOption('--note <id>', 'Note ID')
  .action(async (opts) => {
    try {
      await client().clients.deleteNote(opts.client, opts.note);
      success('Note deleted');
    } catch (err) { error(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });

const notesCommand = new Command('notes')
  .description('Manage client notes')
  .addCommand(notesList)
  .addCommand(notesCreate)
  .addCommand(notesDelete);

// --- Main command ---

export const clientsCommand = new Command('clients')
  .description('Manage clients and CRM')
  .addCommand(list)
  .addCommand(create)
  .addCommand(contactsCommand)
  .addCommand(activitiesCommand)
  .addCommand(notesCommand);
