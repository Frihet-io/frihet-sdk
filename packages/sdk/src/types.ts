// -- SDK options --

export interface FrihetOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface RequestOptions {
  timeout?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

// -- API response envelope --

export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  nextCursor?: string;
}

// -- Pagination --

export interface ListParams {
  limit?: number;
  offset?: number;
  cursor?: string;
  fields?: string;
}

export interface DateFilterParams extends ListParams {
  from?: string;
  to?: string;
}

// -- Address --

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

// -- Line items --

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

// -- Invoice --

export interface Invoice {
  id: string;
  documentNumber?: string;
  clientName: string;
  clientId?: string;
  clientAddress?: string | Address;
  clientTaxId?: string;
  clientLocation?: 'peninsula' | 'canarias' | 'ceuta_melilla' | 'eu' | 'world';
  items: LineItem[];
  issueDate?: string;
  dueDate?: string;
  status?: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';
  notes?: string;
  taxRate?: number;
  irpfRate?: number;
  equivalenceSurchargeRate?: number;
  prepayment?: number;
  seriesId?: string;
  total?: number;
  paymentUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceListParams extends DateFilterParams {
  status?: Invoice['status'];
  q?: string;
  clientId?: string;
  seriesId?: string;
}

export type CreateInvoiceParams = Pick<Invoice, 'clientName' | 'items'> &
  Partial<Pick<Invoice, 'clientId' | 'clientAddress' | 'clientTaxId' | 'clientLocation' | 'issueDate' | 'dueDate' | 'status' | 'notes' | 'taxRate' | 'irpfRate' | 'equivalenceSurchargeRate' | 'prepayment' | 'seriesId'>>;

export type UpdateInvoiceParams = Partial<CreateInvoiceParams>;

export interface SendInvoiceParams {
  recipientEmail: string;
  recipientName?: string;
  customMessage?: string;
  locale?: 'es' | 'en';
}

// -- Expense --

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category?: string;
  date?: string;
  vendor?: string;
  vendorId?: string;
  invoiceNumber?: string;
  tax?: number;
  taxType?: 'IVA' | 'IGIC' | 'IPSI' | 'Exento';
  irpf?: number;
  isInvestmentGood?: boolean;
  taxDeductible?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExpenseListParams extends DateFilterParams {
  q?: string;
  vendorId?: string;
  category?: string;
}

export type CreateExpenseParams = Pick<Expense, 'description' | 'amount'> &
  Partial<Pick<Expense, 'category' | 'date' | 'vendor' | 'vendorId' | 'invoiceNumber' | 'tax' | 'taxType' | 'irpf' | 'isInvestmentGood' | 'taxDeductible'>>;

export type UpdateExpenseParams = Partial<CreateExpenseParams>;

// -- Client --

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  website?: string;
  address?: string | Address;
  fiscalZone?: 'peninsula' | 'canarias' | 'ceuta_melilla' | 'eu' | 'world';
  clientType?: 'company' | 'individual';
  applyEquivalenceSurcharge?: boolean;
  stage?: 'lead' | 'contacted' | 'proposal' | 'active' | 'inactive' | 'lost';
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientListParams extends ListParams {
  q?: string;
  stage?: Client['stage'];
}

export type CreateClientParams = Pick<Client, 'name'> &
  Partial<Pick<Client, 'email' | 'phone' | 'taxId' | 'website' | 'address' | 'fiscalZone' | 'clientType' | 'applyEquivalenceSurcharge' | 'stage' | 'tags'>>;

export type UpdateClientParams = Partial<CreateClientParams>;

// -- CRM: Client Contacts --

export interface ClientContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateContactParams = Pick<ClientContact, 'name'> &
  Partial<Pick<ClientContact, 'email' | 'phone' | 'role' | 'isPrimary'>>;

export type UpdateContactParams = Partial<CreateContactParams>;

// -- CRM: Client Activities --

export type ActivityType =
  | 'call' | 'email' | 'meeting' | 'note_added' | 'task'
  | 'invoice_created' | 'invoice_sent' | 'invoice_paid' | 'invoice_overdue'
  | 'quote_created' | 'quote_accepted' | 'quote_rejected'
  | 'expense_logged';

export interface ClientActivity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, string>;
  createdBy?: 'system' | 'user';
  createdAt?: string;
}

export type CreateActivityParams = Pick<ClientActivity, 'title'> & {
  type: 'call' | 'email' | 'meeting' | 'task';
  description?: string;
  metadata?: Record<string, string>;
};

// -- CRM: Client Notes --

export interface ClientNote {
  id: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateNoteParams = Pick<ClientNote, 'content'>;
export type UpdateNoteParams = Partial<CreateNoteParams>;

// -- Vendor --

export interface Vendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  address?: string | Address;
  createdAt?: string;
  updatedAt?: string;
}

export interface VendorListParams extends ListParams {
  q?: string;
}

export type CreateVendorParams = Pick<Vendor, 'name'> &
  Partial<Pick<Vendor, 'email' | 'phone' | 'taxId' | 'address'>>;

export type UpdateVendorParams = Partial<CreateVendorParams>;

// -- Product --

export interface Product {
  id: string;
  name: string;
  unitPrice: number;
  description?: string;
  sku?: string;
  category?: string;
  taxRate?: number;
  irpfRate?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductListParams extends ListParams {
  q?: string;
  isActive?: boolean;
}

export type CreateProductParams = Pick<Product, 'name' | 'unitPrice'> &
  Partial<Pick<Product, 'description' | 'sku' | 'category' | 'taxRate' | 'irpfRate' | 'isActive'>>;

export type UpdateProductParams = Partial<CreateProductParams>;

// -- Quote --

export interface Quote {
  id: string;
  documentNumber?: string;
  clientName: string;
  clientId?: string;
  items: LineItem[];
  validUntil?: string;
  notes?: string;
  status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
  taxRate?: number;
  total?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuoteListParams extends DateFilterParams {
  status?: Quote['status'];
  q?: string;
  clientId?: string;
  seriesId?: string;
}

export type CreateQuoteParams = Pick<Quote, 'clientName' | 'items'> &
  Partial<Pick<Quote, 'clientId' | 'validUntil' | 'notes' | 'status' | 'taxRate'>>;

export type UpdateQuoteParams = Partial<CreateQuoteParams>;

// -- Webhook --

export type WebhookEvent =
  | 'invoice.created' | 'invoice.updated' | 'invoice.paid' | 'invoice.overdue'
  | 'expense.created' | 'expense.updated'
  | 'quote.created' | 'quote.updated' | 'quote.accepted' | 'quote.rejected'
  | 'client.created' | 'client.updated'
  | 'product.created' | 'product.updated';

export interface Webhook {
  id: string;
  name?: string;
  url: string;
  events: WebhookEvent[];
  status?: 'active' | 'inactive' | 'paused';
  secret?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebhookListParams extends ListParams {}

export type CreateWebhookParams = Pick<Webhook, 'url' | 'events'> &
  Partial<Pick<Webhook, 'name' | 'status' | 'secret'>>;

export type UpdateWebhookParams = Partial<CreateWebhookParams>;

// -- Intelligence --

export interface BusinessContext {
  business: Record<string, unknown>;
  defaults: Record<string, unknown>;
  plan: Record<string, unknown>;
  series: Record<string, unknown>[];
  recentActivity: Record<string, unknown>;
  topClients: Record<string, unknown>[];
  currentMonth: Record<string, unknown>;
}

export interface MonthlySummary {
  month: string;
  revenue: { total: number; taxBase: number; tax: number; irpf: number };
  expenses: { total: number; deductible: number; tax: number };
  profit: { gross: number; net: number };
  invoices: Record<string, number>;
  topClients: { name: string; total: number }[];
  expensesByCategory: { category: string; amount: number }[];
  taxLiability: Record<string, number>;
}

export interface QuarterlyTaxes {
  quarter: string;
  periods: string[];
  modelo303: {
    baseImponible: number;
    cuotaRepercutida: number;
    baseDeducible: number;
    cuotaDeducible: number;
    resultado: number;
  };
  modelo130: {
    ingresos: number;
    gastos: number;
    rendimientoNeto: number;
    pagoFraccionado: number;
  };
  summary: Record<string, number>;
}

export interface FinancialSummary {
  revenue: { invoiced: number; paid: number; pending: number; overdue: number };
  expenses: number;
  profit: number;
  counts: Record<string, number>;
  invoiceStatus: Record<string, number>;
  overdue: { count: number; total: number };
}

export interface SummaryParams {
  from?: string;
  to?: string;
}

// -- Action results --

export interface MarkPaidResult {
  success?: boolean;
  message?: string;
  status: string;
  paidAt?: string;
}

export interface SendResult {
  success: boolean;
  messageId: string;
}

// -- Batch --

export interface BatchResultItem<T> {
  index: number;
  success: boolean;
  data?: T;
  error?: string;
}

export interface BatchResult<T> {
  data: BatchResultItem<T>[];
  summary: { total: number; succeeded: number; failed: number };
}
