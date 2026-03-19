import { HttpClient } from './client.js';
import { Invoices } from './resources/invoices.js';
import { Expenses } from './resources/expenses.js';
import { Clients } from './resources/clients.js';
import { Products } from './resources/products.js';
import { Quotes } from './resources/quotes.js';
import { Webhooks } from './resources/webhooks.js';
import { Intelligence } from './resources/intelligence.js';
import type { FrihetOptions } from './types.js';

export class Frihet {
  readonly invoices: Invoices;
  readonly expenses: Expenses;
  readonly clients: Clients;
  readonly products: Products;
  readonly quotes: Quotes;
  readonly webhooks: Webhooks;
  readonly intelligence: Intelligence;

  constructor(opts: FrihetOptions) {
    const client = new HttpClient(opts);
    this.invoices = new Invoices(client);
    this.expenses = new Expenses(client);
    this.clients = new Clients(client);
    this.products = new Products(client);
    this.quotes = new Quotes(client);
    this.webhooks = new Webhooks(client);
    this.intelligence = new Intelligence(client);
  }
}

export default Frihet;

// Re-export everything
export { Invoices } from './resources/invoices.js';
export { Expenses } from './resources/expenses.js';
export { Clients } from './resources/clients.js';
export { Products } from './resources/products.js';
export { Quotes } from './resources/quotes.js';
export { Webhooks } from './resources/webhooks.js';
export { Intelligence } from './resources/intelligence.js';
export { FrihetError, APIError, AuthenticationError, NotFoundError, ValidationError, RateLimitError, TimeoutError } from './error.js';
export type * from './types.js';
