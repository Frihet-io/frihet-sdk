import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { invoicesCommand } from './commands/invoices.js';
import { expensesCommand } from './commands/expenses.js';
import { clientsCommand } from './commands/clients.js';
import { quotesCommand } from './commands/quotes.js';
import { productsCommand } from './commands/products.js';
import { vendorsCommand } from './commands/vendors.js';
import { webhooksCommand } from './commands/webhooks.js';
import { statusCommand } from './commands/status.js';

const program = new Command()
  .name('frihet')
  .version('1.0.0')
  .description('Frihet CLI — manage your business from the terminal');

program.addCommand(loginCommand);
program.addCommand(invoicesCommand);
program.addCommand(expensesCommand);
program.addCommand(clientsCommand);
program.addCommand(quotesCommand);
program.addCommand(productsCommand);
program.addCommand(vendorsCommand);
program.addCommand(webhooksCommand);
program.addCommand(statusCommand);

program.parse();
