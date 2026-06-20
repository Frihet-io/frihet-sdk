import { HttpClient } from './client.js';
import { Invoices } from './resources/invoices.js';
import { Expenses } from './resources/expenses.js';
import { Clients } from './resources/clients.js';
import { Products } from './resources/products.js';
import { Quotes } from './resources/quotes.js';
import { Vendors } from './resources/vendors.js';
import { Webhooks } from './resources/webhooks.js';
import { Intelligence } from './resources/intelligence.js';
import { Stays } from './resources/stay.js';
import { Deposits } from './resources/deposits.js';
import { Team } from './resources/team.js';
import { Gestoria } from './resources/gestoria.js';
import { Channels } from './resources/channels.js';
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
  /** Hospitality / short-term rental management (Phase 4 Frihet Stay app). */
  readonly stay: Stays;
  /** Customer deposits / down-payments (money movement + apply/refund). */
  readonly deposits: Deposits;
  /** Team members, invitations, and role changes (server enforces seat caps). */
  readonly team: Team;
  /** Accountant consolidated receivables aging across client workspaces. */
  readonly gestoria: Gestoria;
  /** Stay distribution channel feeds (iCal / API OTA bindings) + sync. */
  readonly channels: Channels;

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
    this.stay = new Stays(client);
    this.deposits = new Deposits(client);
    this.team = new Team(client);
    this.gestoria = new Gestoria(client);
    this.channels = new Channels(client);
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
export { Stays } from './resources/stay.js';
export { Deposits } from './resources/deposits.js';
export { Team } from './resources/team.js';
export { Gestoria } from './resources/gestoria.js';
export { Channels } from './resources/channels.js';
export { FrihetError, APIError, AuthenticationError, NotFoundError, ValidationError, ConflictError, TeamSeatLimitError, RateLimitError, TimeoutError } from './error.js';
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
