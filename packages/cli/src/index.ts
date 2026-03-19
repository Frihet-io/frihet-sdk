import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { invoicesCommand } from './commands/invoices.js';
import { expensesCommand } from './commands/expenses.js';
import { clientsCommand } from './commands/clients.js';
import { statusCommand } from './commands/status.js';

const program = new Command()
  .name('frihet')
  .version('1.0.0')
  .description('Frihet CLI — manage your business from the terminal');

program.addCommand(loginCommand);
program.addCommand(invoicesCommand);
program.addCommand(expensesCommand);
program.addCommand(clientsCommand);
program.addCommand(statusCommand);

program.parse();
