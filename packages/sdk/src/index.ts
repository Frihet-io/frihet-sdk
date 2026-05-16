import { HttpClient } from './client.js';
import { Invoices } from './resources/invoices.js';
import { Expenses } from './resources/expenses.js';
import { Clients } from './resources/clients.js';
import { Products } from './resources/products.js';
import { Quotes } from './resources/quotes.js';
import { Vendors } from './resources/vendors.js';
import { Webhooks } from './resources/webhooks.js';
import { Intelligence } from './resources/intelligence.js';
import type { FrihetOptions } from './types.js';

export class Frihet {
  readonly invoices: Invoices;
  readonly expenses: Expenses;
  readonly clients: Clients;
  readonly vendors: Vendors;
  readonly products: Products;
  readonly quotes: Quotes;
  readonly webhooks: Webhooks;
  readonly intelligence: Intelligence;

  constructor(opts: FrihetOptions) {
    const client = new HttpClient(opts);
    this.invoices = new Invoices(client);
    this.expenses = new Expenses(client);
    this.clients = new Clients(client);
    this.vendors = new Vendors(client);
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
export { Vendors } from './resources/vendors.js';
export { Webhooks } from './resources/webhooks.js';
export { Intelligence } from './resources/intelligence.js';
export { FrihetError, APIError, AuthenticationError, NotFoundError, ValidationError, RateLimitError, TimeoutError } from './error.js';
export type * from './types.js';

// -- D4-C: HR + Banking + Period close + Webhook event taxonomy (forward types) --
export type {
  LeaveType,
  LeaveStatus,
  LeaveRequest,
  LeaveEntitlement,
  CreateLeaveRequestParams,
  LeaveListParams,
  MoodValue,
  DeviceType,
  BreakType,
  BreakEntry,
  AttendanceEntry,
  PayrollExportFormat,
  PayrollProfile,
} from './types/hr.js';

export type {
  BankTransaction,
  BankExceptionStatus,
  BankException,
  BankRuleConditionField,
  BankRuleConditionOperator,
  BankRuleCondition,
  BankRuleActionType,
  BankRuleActionConfig,
  BankRule,
  CreateBankRuleParams,
  BankRuleSimulateResult,
} from './types/banking.js';

export type {
  PeriodCloseStatus,
  PeriodGranularity,
  PeriodClose,
} from './types/period.js';

export type {
  WebhookEventCategory,
  WebhookEventName,
  WebhookSignaturePayload,
} from './types/webhookEvents.js';

// -- D4-C: helpers --
export { createLeaveRequest, approveLeave, rejectLeave } from './api/leaves.js';
export { bankRuleSimulate } from './api/banking.js';
export { periodCloseStatus } from './api/period.js';
export { webhookSignatureVerify } from './api/webhookSignature.js';
